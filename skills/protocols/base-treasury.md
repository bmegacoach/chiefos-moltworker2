---
name: base-treasury
description: Base network treasury operations and token monitoring
---

# Base Treasury Operations

## Overview
Patterns for monitoring treasury positions and token balances on Base network.

## RPC Configuration

```typescript
// Base Mainnet
const BASE_RPC = "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;

// Key contract addresses (to be configured)
const CONTRACTS = {
  GBB_TOKEN: "0x...",      // Goldbackbond OFT
  CAMP_TOKEN: "0x...",     // CAMP Synthetic
  MARKETPLACE: "0x...",    // Bondcurve Factory
  TREASURY: "0x..."        // Treasury multisig
};
```

## Token Supply Monitoring

```typescript
interface TokenMetrics {
  totalSupply: bigint;
  circulatingSupply: bigint;
  treasuryBalance: bigint;
  lastUpdated: number;
}

// ERC20 ABI for supply queries
const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
```

## Treasury Health Check

```typescript
interface TreasuryHealth {
  collateralRatio: number;   // Target: >= 1.0
  reserveAssets: Asset[];
  pendingRedemptions: bigint;
  status: "HEALTHY" | "WARNING" | "CRITICAL";
}

function assessTreasuryHealth(metrics: TreasuryHealth): string {
  if (metrics.collateralRatio >= 1.02) return "HEALTHY";
  if (metrics.collateralRatio >= 1.0) return "WARNING";
  return "CRITICAL";
}
```

## Event Monitoring

```typescript
// Key events to monitor
const TREASURY_EVENTS = [
  "Transfer(address,address,uint256)",
  "Mint(address,uint256)",
  "Burn(address,uint256)",
  "CollateralDeposited(address,uint256)",
  "CollateralWithdrawn(address,uint256)"
];
```

## Gas Optimization

Base uses Optimism's L2 architecture:
- L1 data availability costs dominate
- Batch operations when possible
- Monitor `basefee` for optimal timing
