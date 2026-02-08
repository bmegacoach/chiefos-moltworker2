---
name: bondcurve-math
description: Bonding curve calculations for marketplace token launches
---

# Bondcurve Mathematics

## Overview
Calculations for bonding curve token launches in Camp Marketplace.

## Linear Bonding Curve

```typescript
// Price increases linearly with supply
function getLinearPrice(
  supply: bigint,
  startPrice: bigint,
  slope: bigint
): bigint {
  return startPrice + (slope * supply);
}

// Cost to buy tokens
function getLinearBuyCost(
  currentSupply: bigint,
  amount: bigint,
  startPrice: bigint,
  slope: bigint
): bigint {
  // Integral of price function
  const endSupply = currentSupply + amount;
  const startCost = startPrice * currentSupply + (slope * currentSupply * currentSupply) / 2n;
  const endCost = startPrice * endSupply + (slope * endSupply * endSupply) / 2n;
  return endCost - startCost;
}
```

## Exponential Bonding Curve

```typescript
// Price grows exponentially
function getExponentialPrice(
  supply: bigint,
  basePrice: bigint,
  exponent: number
): bigint {
  // P = basePrice * (1 + supply/scale)^exponent
  const scale = 1000000n; // 6 decimal precision
  return basePrice * BigInt(Math.pow(1 + Number(supply) / Number(scale), exponent));
}
```

## Launch Progress Tracking

```typescript
interface LaunchProgress {
  tokenAddress: string;
  currentSupply: bigint;
  maxSupply: bigint;
  currentPrice: bigint;
  raised: bigint;           // Total CAMP/ETH raised
  progressPercent: number;  // 0-100
  status: "ACTIVE" | "COMPLETED" | "FAILED";
}

function calculateProgress(launch: LaunchProgress): number {
  return Number((launch.currentSupply * 100n) / launch.maxSupply);
}
```

## Fee Collection

```typescript
// Marketplace fees (configurable)
const FEE_BPS = 250; // 2.5% fee

function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BPS)) / 10000n;
}
```

## Anti-Sniping Protection

```typescript
// Rate limiting for early buyers
interface AntiSnipe {
  maxBuyPerBlock: bigint;
  cooldownBlocks: number;
  whitelistEnabled: boolean;
}
```
