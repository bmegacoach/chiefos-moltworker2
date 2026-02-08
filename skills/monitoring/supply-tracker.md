---
name: supply-tracker
description: Token supply monitoring across chains
---

# Supply Tracker

## Overview
Continuous monitoring of GBB, CAMP, and Marketplace token supplies.

## Data Structure

```typescript
interface SupplySnapshot {
  timestamp: number;
  token: "GBB" | "CAMP" | "MARKETPLACE";
  chains: {
    chainId: number;
    supply: bigint;
    change24h: bigint;
    changePercent: number;
  }[];
  totalSupply: bigint;
  totalChange24h: bigint;
}
```

## Monitoring Loop

```typescript
// Run every 5 minutes
async function trackSupply(token: string): Promise<SupplySnapshot> {
  const chains = [BASE_MAINNET, ARBITRUM, ETHEREUM];
  const supplies = await Promise.all(
    chains.map(chain => getChainSupply(token, chain))
  );
  
  const snapshot: SupplySnapshot = {
    timestamp: Date.now(),
    token,
    chains: supplies,
    totalSupply: supplies.reduce((a, b) => a + b.supply, 0n),
    totalChange24h: await calculate24hChange(token)
  };
  
  await storeSnapshot(snapshot);
  return snapshot;
}
```

## Alert Thresholds

```typescript
const SUPPLY_ALERTS = {
  // Alert if supply changes more than X% in 1 hour
  rapidChange: 5,
  // Alert if single chain holds more than X% of supply
  concentrationRisk: 70,
  // Alert if cross-chain imbalance detected
  imbalanceThreshold: 10
};

function checkAlerts(snapshot: SupplySnapshot): Alert[] {
  const alerts: Alert[] = [];
  
  // Check rapid change
  if (Math.abs(snapshot.changePercent) > SUPPLY_ALERTS.rapidChange) {
    alerts.push({
      type: "RAPID_SUPPLY_CHANGE",
      severity: "WARNING",
      message: `${snapshot.token} supply changed ${snapshot.changePercent}% in last hour`
    });
  }
  
  return alerts;
}
```

## Storage (R2)

```typescript
// Store in Cloudflare R2
const BUCKET = "chiefos-memory";
const PREFIX = "supply-snapshots/";

async function storeSnapshot(snapshot: SupplySnapshot): Promise<void> {
  const key = `${PREFIX}${snapshot.token}/${snapshot.timestamp}.json`;
  await R2.put(key, JSON.stringify(snapshot));
}
```
