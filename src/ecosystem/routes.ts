// Ecosystem Manager Routes
// Part of ChiefOS Moltworker

import type { EcosystemEnv, OperationalReport } from './types';
import { EcosystemManager, ObserverAgent } from './index';
import { serializeWithBigInt } from './utils';
import { formatReportSummary } from './scheduled';

/**
 * Handle ecosystem API requests
 */
export async function handleEcosystemRequest(
    request: Request,
    env: EcosystemEnv
): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if ecosystem is enabled
    if (env.ECOSYSTEM_ENABLED !== "true") {
        return new Response(serializeWithBigInt({ error: "Ecosystem manager disabled" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // Route handling
        if (path === "/ecosystem/status" || path === "/ecosystem") {
            return await getStatus(env);
        }

        if (path === "/ecosystem/report") {
            return await getLatestReport(env);
        }

        if (path === "/ecosystem/report/generate") {
            return await generateReport(env);
        }

        if (path === "/ecosystem/alerts") {
            return await getAlerts(env);
        }

        if (path === "/ecosystem/skills/pending") {
            return await getPendingSkills(env);
        }


        // ClickUp Webhook Handler
        if (path === "/ecosystem/webhooks/clickup" && request.method === "POST") {
            try {
                const payload = await request.json() as any;
                const { event, task_id } = payload;
                console.log(`Received ClickUp event: ${event} for task ${task_id}`);

                // In a real implementation, we would pass this to the Orchestrator agent
                // const orchestration = new ClickUpOrchestrator(env);
                // await orchestration.handleEvent(payload);

                return new Response(JSON.stringify({ received: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
            }
        }

        // Test Endpoint

        if (path === "/ecosystem/test-notify") {
            const { sendDiscordMessage, sendTelegramMessage } = await import('./notifications');
            const results: any = {};

            if (env.DISCORD_CHANNEL_OPS) {
                results.discord = await sendDiscordMessage(env, "🔔 **Test Notification** from ChiefSOS Moltworker", env.DISCORD_CHANNEL_OPS);
            } else {
                results.discord = "Skipped (No Channel ID)";
            }

            if (env.TELEGRAM_BOT_TOKEN) {
                // Try sending to a default chat ID if available, otherwise just report token is there
                if (env.TELEGRAM_CHAT_ID) {
                    results.telegram = await sendTelegramMessage(env, "🔔 Test Notification from ChiefSOS Moltworker");
                } else {
                    results.telegram = "Skipped (No TELEGRAM_CHAT_ID). Use /ecosystem/debug/telegram to find it.";
                }
            }

            return new Response(JSON.stringify(results, null, 2), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Manually Trigger Scheduled Report (Debug)
        if (path === "/ecosystem/debug/trigger-report") {
            const { handleScheduled } = await import('./scheduled');
            // Mock controller and context
            const controller = { scheduledTime: Date.now(), cron: "manual-trigger" } as any;
            const ctx = { waitUntil: (p: Promise<any>) => p } as any;

            await handleScheduled(controller, env, ctx);

            return new Response(JSON.stringify({ success: true, message: "Triggered scheduled report. Check Discord." }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Telegram Debug Helper
        if (path === "/ecosystem/debug/telegram") {
            if (!env.TELEGRAM_BOT_TOKEN) {
                return new Response(JSON.stringify({ error: "No TELEGRAM_BOT_TOKEN set" }), { headers: { "Content-Type": "application/json" } });
            }
            const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`;
            const resp = await fetch(url);
            const data = await resp.json();
            return new Response(JSON.stringify(data, null, 2), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(serializeWithBigInt({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Ecosystem API error:", error);
        return new Response(serializeWithBigInt({
            error: "Internal error (Caught)",
            message: String(error),
            stack: error instanceof Error ? error.stack : undefined
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * GET /ecosystem/status - Quick status check
 */
async function getStatus(env: EcosystemEnv): Promise<Response> {
    const manager = new EcosystemManager(env);
    const agents = manager.getAgents();

    const [usdgbReport, usdcaReport, governorReport] = await Promise.all([
        agents.usdgb.generateReport(),
        agents.usdca.generateReport(),
        agents.governor.generateReport()
    ]);

    return new Response(serializeWithBigInt({
        status: "online",
        risk: governorReport.riskStatus.overall,
        emergency: governorReport.emergencyStatus,
        usdgb: {
            pegPrice: usdgbReport.pegPrice,
            goldReserveRatio: usdgbReport.goldReserveRatio,
            stakingAPR: usdgbReport.stakingAPR
        },
        usdca: {
            pegPrice: usdcaReport.pegPrice,
            deltaCollateralization: usdcaReport.deltaCollateralization,
            fundingRateAPY: usdcaReport.fundingRateAPY
        },
        timestamp: Date.now()
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * GET /ecosystem/report - Get latest 4-hour report
 */
async function getLatestReport(env: EcosystemEnv): Promise<Response> {
    try {
        const obj = await env.ECOSYSTEM_BUCKET.get("reports/latest.json");
        if (!obj) {
            return new Response(serializeWithBigInt({
                error: "No report available",
                message: "Run /ecosystem/report/generate first"
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const report: OperationalReport = JSON.parse(await obj.text());

        // Return with formatted summary
        return new Response(serializeWithBigInt({
            ...report,
            formatted: formatReportSummary(report)
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch {
        return new Response(serializeWithBigInt({ error: "Failed to retrieve report" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /ecosystem/report/generate - Generate new report
 */
async function generateReport(env: EcosystemEnv): Promise<Response> {
    const manager = new EcosystemManager(env);
    const report = await manager.generate4HourReport();

    // Store as latest (use serializeWithBigInt for storage too)
    await env.ECOSYSTEM_BUCKET.put("reports/latest.json", serializeWithBigInt(report));

    return new Response(serializeWithBigInt({
        success: true,
        report,
        formatted: formatReportSummary(report)
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * GET /ecosystem/alerts - Get current alerts
 */
async function getAlerts(env: EcosystemEnv): Promise<Response> {
    const manager = new EcosystemManager(env);
    const agents = manager.getAgents();

    const governorReport = await agents.governor.generateReport();

    return new Response(serializeWithBigInt({
        count: governorReport.riskStatus.alerts.length,
        alerts: governorReport.riskStatus.alerts,
        risk: governorReport.riskStatus.overall,
        categories: governorReport.riskStatus.categories
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * GET /ecosystem/skills/pending - Get pending skill PRs
 */
async function getPendingSkills(env: EcosystemEnv): Promise<Response> {
    try {
        const listed = await env.ECOSYSTEM_BUCKET.list({ prefix: "skill-prs/" });
        const pending: unknown[] = [];

        for (const obj of listed.objects) {
            const data = await env.ECOSYSTEM_BUCKET.get(obj.key);
            if (data) {
                const pr = JSON.parse(await data.text());
                if (pr.status === "PENDING_REVIEW") {
                    pending.push(pr);
                }
            }
        }

        return new Response(serializeWithBigInt({
            count: pending.length,
            skills: pending
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch {
        return new Response(serializeWithBigInt({ error: "Failed to retrieve skills" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

