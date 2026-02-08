// Ecosystem Manager Index
// Part of ChiefOS Moltworker

export * from './types';
export { USDGBAgent } from './usdgb-agent';
export { USDcaAgent } from './usdca-agent';
export { MarketplaceAgent } from './marketplace-agent';
export { GovernorAgent } from './governor-agent';
export { ObserverAgent } from './observer-agent';
export { MemUClient, createMemUClient } from './memu-client';
// PromoterAgent is isolated - import separately from promoter-agent.ts

import type { OperationalReport, EcosystemEnv } from './types';
import { USDGBAgent } from './usdgb-agent';
import { USDcaAgent } from './usdca-agent';
import { MarketplaceAgent } from './marketplace-agent';
import { GovernorAgent } from './governor-agent';
import { ObserverAgent } from './observer-agent';
import { serializeWithBigInt } from './utils';

/**
 * Ecosystem Manager: Coordinates all ecosystem agents
 * 
 * Manages two stablecoins:
 * - USDGB: Gold-backed stablecoin (Goldbackbond)
 * - USDca: Synthetic dollar (CAMP DeFi)
 * 
 * Generates 4-hour operational reports and daily briefs
 */
export class EcosystemManager {
    private env: EcosystemEnv;
    private usdgbAgent: USDGBAgent;
    private usdcaAgent: USDcaAgent;
    private marketplaceAgent: MarketplaceAgent;
    private governorAgent: GovernorAgentWrapper;
    private observerAgent: ObserverAgent;

    constructor(env: EcosystemEnv) {
        this.env = env;

        // Initialize agents
        this.usdgbAgent = new USDGBAgent(env);
        this.usdcaAgent = new USDcaAgent(env);
        this.marketplaceAgent = new MarketplaceAgent(env);
        this.observerAgent = new ObserverAgent(env);

        // Governor needs references to token agents for risk aggregation
        this.governorAgent = new GovernorAgentWrapper(
            env,
            this.usdgbAgent,
            this.usdcaAgent,
            this.marketplaceAgent
        );
    }

    /**
     * Generate 4-hour operational report
     */
    async generate4HourReport(): Promise<OperationalReport> {
        const [usdgb, usdca, marketplace, governor, observer] = await Promise.all([
            this.usdgbAgent.generateReport(),
            this.usdcaAgent.generateReport(),
            this.marketplaceAgent.generateReport(),
            this.governorAgent.generateReport(),
            this.observerAgent.generateReport()
        ]);

        const report: OperationalReport = {
            timestamp: Date.now(),
            period: "4h",
            agents: {
                usdgb,
                usdca,
                marketplace,
                governor,
                observer
            },
            summary: this.generateSummary(usdgb, usdca, marketplace, governor)
        };

        // Store report
        await this.storeReport(report);

        return report;
    }

    /**
     * Generate summary from agent reports
     */
    private generateSummary(
        usdgb: Awaited<ReturnType<USDGBAgent['generateReport']>>,
        usdca: Awaited<ReturnType<USDcaAgent['generateReport']>>,
        marketplace: Awaited<ReturnType<MarketplaceAgent['generateReport']>>,
        governor: Awaited<ReturnType<GovernorAgentWrapper['generateReport']>>
    ): string {
        const riskEmoji = {
            GREEN: "🟢",
            YELLOW: "🟡",
            ORANGE: "🟠",
            RED: "🔴"
        };

        return `
${riskEmoji[governor.riskStatus.overall]} Risk Status: ${governor.riskStatus.overall}

USDGB (Gold-backed): $${usdgb.pegPrice.toFixed(4)} | Reserve ${(usdgb.goldReserveRatio * 100).toFixed(1)}%
USDca (Synthetic): $${usdca.pegPrice.toFixed(4)} | Delta ${(usdca.deltaCollateralization * 100).toFixed(1)}%
Marketplace: ${marketplace.activeLaunches} active launches

Alerts: ${governor.riskStatus.alerts.length}
Cross-chain msgs verified: ${governor.crossChainMessagesVerified}
Emergency status: ${governor.emergencyStatus}
    `.trim();
    }

    /**
     * Store report to R2
     */
    private async storeReport(report: OperationalReport): Promise<void> {
        const key = `reports/${report.period}/${report.timestamp}.json`;
        await this.env.ECOSYSTEM_BUCKET.put(key, serializeWithBigInt(report));
    }

    /**
     * Get agents for direct access
     */
    getAgents() {
        return {
            usdgb: this.usdgbAgent,
            usdca: this.usdcaAgent,
            marketplace: this.marketplaceAgent,
            governor: this.governorAgent,
            observer: this.observerAgent
        };
    }
}

/**
 * Governor Agent Wrapper (updated for new token agents)
 */
class GovernorAgentWrapper {
    private env: EcosystemEnv;
    private usdgbAgent: USDGBAgent;
    private usdcaAgent: USDcaAgent;
    private marketplaceAgent: MarketplaceAgent;
    private emergencyStatus: "STANDBY" | "ACTIVE" | "PAUSED" = "STANDBY";
    private messagesVerified = 0;

    constructor(
        env: EcosystemEnv,
        usdgbAgent: USDGBAgent,
        usdcaAgent: USDcaAgent,
        marketplaceAgent: MarketplaceAgent
    ) {
        this.env = env;
        this.usdgbAgent = usdgbAgent;
        this.usdcaAgent = usdcaAgent;
        this.marketplaceAgent = marketplaceAgent;
    }

    async generateReport() {
        // Aggregate alerts from all agents
        const usdgbAlerts = await this.usdgbAgent.checkAlerts();
        const usdcaAlerts = await this.usdcaAgent.checkAlerts();
        const marketplaceAlerts = await this.marketplaceAgent.checkAlerts();
        const allAlerts = [...usdgbAlerts, ...usdcaAlerts, ...marketplaceAlerts];

        // Determine risk levels
        const usdgbReserve = await this.usdgbAgent.getGoldReserveRatio();
        const usdcaPeg = await this.usdcaAgent.getPegDeviation();

        type RiskLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

        const collateralRisk: RiskLevel = usdgbReserve >= 1.05 ? "GREEN" : usdgbReserve >= 1.02 ? "YELLOW" : usdgbReserve >= 1.0 ? "ORANGE" : "RED";
        const pegRisk: RiskLevel = usdcaPeg <= 0.005 ? "GREEN" : usdcaPeg <= 0.01 ? "YELLOW" : usdcaPeg <= 0.02 ? "ORANGE" : "RED";

        const riskLevels = [collateralRisk, pegRisk];
        const overall = riskLevels.includes("RED") ? "RED" : riskLevels.includes("ORANGE") ? "ORANGE" : riskLevels.includes("YELLOW") ? "YELLOW" : "GREEN";

        return {
            riskStatus: {
                overall: overall as RiskLevel,
                categories: {
                    collateral: collateralRisk,
                    peg: pegRisk,
                    liquidity: "GREEN" as RiskLevel,
                    crossChain: "GREEN" as RiskLevel
                },
                alerts: allAlerts,
                lastUpdated: Date.now()
            },
            crossChainMessagesVerified: this.messagesVerified,
            emergencyStatus: this.emergencyStatus
        };
    }

    async checkAlerts() {
        return [];
    }
}
