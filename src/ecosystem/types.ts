// Ecosystem Manager Agent Types
// Part of ChiefOS Moltworker

/**
 * Token types in the ecosystem
 * USDGB = Gold-backed stablecoin (Goldbackbond)
 * USDca = Synthetic dollar (CAMP DeFi)
 * MARKETPLACE = Bondcurve launchpad tokens
 */
export type EcosystemToken = "USDGB" | "USDca" | "MARKETPLACE";

/**
 * Risk levels for monitoring
 */
export type RiskLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

/**
 * Agent roles in the ecosystem
 */
export type AgentRole =
    | "USDGB_AGENT"
    | "USDCA_AGENT"
    | "MARKETPLACE_AGENT"
    | "GOVERNOR_AGENT"
    | "MOLTBOOK_OBSERVER"
    | "MOLTBOOK_PROMOTER";

/**
 * Chain configuration for LayerZero
 */
export interface ChainConfig {
    chainId: number;
    name: string;
    lzEndpointId: number;
    rpcUrl: string;
    contracts: {
        usdgb?: string;
        usdca?: string;
        marketplace?: string;
    };
}

/**
 * Supply snapshot for tokens
 */
export interface SupplySnapshot {
    timestamp: number;
    token: EcosystemToken;
    chains: ChainSupply[];
    totalSupply: bigint;
    totalChange24h: bigint;
}

export interface ChainSupply {
    chainId: number;
    supply: bigint;
    change24h: bigint;
    changePercent: number;
}

/**
 * Risk status for Governor Agent
 */
export interface RiskStatus {
    overall: RiskLevel;
    categories: {
        collateral: RiskLevel;
        peg: RiskLevel;
        liquidity: RiskLevel;
        crossChain: RiskLevel;
    };
    alerts: Alert[];
    lastUpdated: number;
}

/**
 * System alerts
 */
export interface Alert {
    id: string;
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "WARNING";
    source?: "GOVERNOR" | "USDGB" | "USDCA" | "MARKETPLACE" | "OBSERVER";
    message: string;
    data?: unknown;
    timestamp: number;
    acknowledged?: boolean;
}

/**
 * LayerZero message for cross-chain verification
 */
export interface LayerZeroMessage {
    guid: string;
    nonce: bigint;
    srcEid: number;
    srcAddress: string;
    dstEid: number;
    dstAddress: string;
    payload: string;
    status: "PENDING" | "DELIVERED" | "FAILED";
}

/**
 * Bondcurve launch tracking
 */
export interface BondcurveLaunch {
    tokenAddress: string;
    name: string;
    symbol: string;
    currentSupply: bigint;
    maxSupply: bigint;
    currentPrice: bigint;
    raised: bigint;
    progressPercent: number;
    status: "ACTIVE" | "COMPLETED" | "FAILED";
    createdAt: number;
}

/**
 * 4-hour operational report
 */
export interface OperationalReport {
    timestamp: number;
    period: "4h" | "24h";
    agents: {
        usdgb: USDGBAgentReport;
        usdca: USDcaAgentReport;
        marketplace: MarketplaceAgentReport;
        governor: GovernorAgentReport;
        observer: ObserverAgentReport;
    };
    summary: string;
}

/**
 * USDGB Agent Report (Goldbackbond - Gold-backed stablecoin)
 * NOT a traditional bond - no maturities
 * Backed by Bloomberg-listed Goldbacked Secured Debentures
 */
export interface USDGBAgentReport {
    supply: SupplySnapshot;
    /** Gold reserve backing ratio (target: 1.0+) */
    goldReserveRatio: number;
    /** Current USD peg price (target: $1.00) */
    pegPrice: number;
    /** Deviation from $1.00 peg */
    pegDeviation: number;
    /** Total value locked in staking programs */
    stakedTVL: bigint;
    /** Current staking APR */
    stakingAPR: number;
    alertCount: number;
}

/**
 * USDca Agent Report (CAMP DeFi - Synthetic dollar)
 * Delta-neutral strategy using staked ETH/BTC/SOL + short futures
 * Generates yield from funding rates & staking rewards
 */
export interface USDcaAgentReport {
    supply: SupplySnapshot;
    /** Current USD peg price */
    pegPrice: number;
    /** Deviation from $1.00 peg */
    pegDeviation: number;
    /** Collateralization from delta-neutral positions */
    deltaCollateralization: number;
    /** Current funding rate yield */
    fundingRateAPY: number;
    /** sUSDca staking rewards APY */
    stakingRewardsAPY: number;
    alertCount: number;
}

export interface MarketplaceAgentReport {
    activeLaunches: number;
    completedLaunches24h: number;
    totalRaised24h: bigint;
    feeCollected24h: bigint;
}

export interface GovernorAgentReport {
    riskStatus: RiskStatus;
    crossChainMessagesVerified: number;
    emergencyStatus: "STANDBY" | "ACTIVE" | "PAUSED";
}

export interface ObserverAgentReport {
    skillsReviewed: number;
    skillsHarvested: number;
    exploitsDetected: number;
    securityAlerts: number;
    marketIntelUpdated: number;
    marketIntelligence: unknown;
    pendingPRs: number;
}

/**
 * Environment bindings for Ecosystem Manager
 */
export interface EcosystemEnv {
    // Feature flag
    ECOSYSTEM_ENABLED: string;

    // R2 bucket for ecosystem data
    ECOSYSTEM_BUCKET: R2Bucket;

    // RPC endpoints
    BASE_RPC_URL: string;

    // LayerZero configuration
    LZ_ENDPOINT_ADDRESS: string;

    // Contract addresses (optional - filled when deployed)
    USDGB_TOKEN_ADDRESS?: string;
    USDCA_TOKEN_ADDRESS?: string;
    MARKETPLACE_ADDRESS?: string;

    // API keys for external services
    MOLTBOOK_API_KEY?: string;

    // Notification Configuration
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string; // Optional: Default chat ID if needed
    DISCORD_BOT_TOKEN?: string;
    DISCORD_CHANNEL_DAILY?: string;
    DISCORD_CHANNEL_OPS?: string;
}
