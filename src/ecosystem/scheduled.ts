// Scheduled Handler for 4-hour Reports
// Part of ChiefOS Ecosystem Manager

import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { EcosystemEnv, OperationalReport } from './types';
import { EcosystemManager } from './index';
import { serializeWithBigInt } from './utils';

/**
 * Scheduled event handler for cron triggers
 * Runs every 4 hours to generate operational reports
 */
export async function handleScheduled(
    controller: ScheduledController,
    env: EcosystemEnv,
    _ctx: ExecutionContext
): Promise<void> {
    console.log(`[${new Date().toISOString()}] Ecosystem scheduled task triggered`);

    // Check if ecosystem is enabled
    if (env.ECOSYSTEM_ENABLED !== "true") {
        console.log("Ecosystem manager disabled, skipping");
        return;
    }

    const manager = new EcosystemManager(env);

    try {
        // Generate 4-hour report
        const report = await manager.generate4HourReport();

        console.log(`Report generated: Risk=${report.agents.governor.riskStatus.overall}`);
        console.log(`Alerts: ${report.agents.governor.riskStatus.alerts.length}`);

        // Check for critical alerts
        const criticalAlerts = report.agents.governor.riskStatus.alerts.filter(
            a => a.severity === "CRITICAL" || a.severity === "HIGH"
        );

        if (criticalAlerts.length > 0) {
            console.log(`CRITICAL: ${criticalAlerts.length} high-priority alerts`);
            // TODO: Trigger n8n webhook for immediate notification
        }

        // Store latest report for API access
        await env.ECOSYSTEM_BUCKET.put(
            "reports/latest.json",
            serializeWithBigInt(report)
        );

        // --- Notifications ---
        const { sendDiscordMessage, sendTelegramMessage } = await import('./notifications');
        const summary = formatReportSummary(report);

        // 1. Ops Channel (Discord) - Always send
        if (env.DISCORD_CHANNEL_OPS) {
            await sendDiscordMessage(env, summary, env.DISCORD_CHANNEL_OPS);
        }

        // 2. Daily Report (Telegram + Discord Daily)
        // Check if it's 8 AM or 8 PM (approx) or if report period is daily (not fully implemented yet, assuming all scheduled are 4h for now)
        // For now, we send critical alerts to Telegram always
        if (criticalAlerts.length > 0) {
            const alertMsg = `🚨 **CRITICAL ALERTS DETECTED**\n${mobileFriendlySummary(report)}`;
            await sendTelegramMessage(env, alertMsg); // Chat ID must be set in env or passed
        }

    } catch (error) {
        console.error("Scheduled task failed:", error);

        // Try to notify alert channel about the crash
        if (env.DISCORD_CHANNEL_OPS) {
            const { sendDiscordMessage } = await import('./notifications');
            await sendDiscordMessage(env, `🚨 **CRITICAL ERROR** in Scheduled Task:\n\`\`\`${String(error)}\`\`\``, env.DISCORD_CHANNEL_OPS);
        }

        // Log error for debugging
        await env.ECOSYSTEM_BUCKET.put(
            `errors/${Date.now()}.json`,
            JSON.stringify({
                timestamp: Date.now(),
                error: String(error),
                task: "scheduled-report"
            })
        );
    }
}

/**
 * Generate summary text for report
 */
export function formatReportSummary(report: OperationalReport): string {
    const riskEmoji = {
        GREEN: "🟢",
        YELLOW: "🟡",
        ORANGE: "🟠",
        RED: "🔴"
    };

    const risk = report.agents.governor.riskStatus;
    const usdgb = report.agents.usdgb;
    const usdca = report.agents.usdca;
    const marketplace = report.agents.marketplace;

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${riskEmoji[risk.overall]} ECOSYSTEM STATUS: ${risk.overall}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Stablecoin Metrics
├─ USDGB (Gold-backed): $${usdgb.pegPrice.toFixed(4)} | Reserve ${(usdgb.goldReserveRatio * 100).toFixed(1)}%
├─ USDca (Synthetic): $${usdca.pegPrice.toFixed(4)} | Delta ${(usdca.deltaCollateralization * 100).toFixed(1)}%
└─ Marketplace: ${marketplace.activeLaunches} active launches

🔐 Security
├─ Cross-chain msgs verified: ${report.agents.governor.crossChainMessagesVerified}
├─ Emergency status: ${report.agents.governor.emergencyStatus}
└─ Alerts: ${risk.alerts.length}

🧠 Intelligence
├─ Skills harvested: ${report.agents.observer.skillsHarvested}
└─ Security alerts: ${report.agents.observer.securityAlerts}

📅 Generated: ${new Date(report.timestamp).toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

function mobileFriendlySummary(report: OperationalReport): string {
    return `${report.agents.governor.riskStatus.overall} RISK | Alerts: ${report.agents.governor.riskStatus.alerts.length}`;
}
