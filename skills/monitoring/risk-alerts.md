---
name: risk-alerts
description: Risk parameter monitoring and alert generation
---

# Risk Alerts

## Overview
Monitor ecosystem risk parameters and generate alerts for Governor Agent.

## Risk Categories

```typescript
type RiskLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

interface RiskStatus {
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
```

## Collateral Risk

```typescript
const COLLATERAL_THRESHOLDS = {
  green: 1.10,   // >= 110% collateralized
  yellow: 1.05,  // >= 105%
  orange: 1.02,  // >= 102%
  red: 1.00      // < 100% = CRITICAL
};

function assessCollateralRisk(ratio: number): RiskLevel {
  if (ratio >= COLLATERAL_THRESHOLDS.green) return "GREEN";
  if (ratio >= COLLATERAL_THRESHOLDS.yellow) return "YELLOW";
  if (ratio >= COLLATERAL_THRESHOLDS.orange) return "ORANGE";
  return "RED";
}
```

## Peg Deviation Risk

```typescript
const PEG_THRESHOLDS = {
  green: 0.005,   // <= 0.5% deviation
  yellow: 0.01,   // <= 1%
  orange: 0.02,   // <= 2%
  red: 0.05       // > 5% = CRITICAL
};

function assessPegRisk(currentPrice: number, targetPrice: number): RiskLevel {
  const deviation = Math.abs(currentPrice - targetPrice) / targetPrice;
  if (deviation <= PEG_THRESHOLDS.green) return "GREEN";
  if (deviation <= PEG_THRESHOLDS.yellow) return "YELLOW";
  if (deviation <= PEG_THRESHOLDS.orange) return "ORANGE";
  return "RED";
}
```

## Liquidity Risk

```typescript
const LIQUIDITY_THRESHOLDS = {
  minPoolDepth: 100000,     // $100k minimum
  maxSlippage: 0.02,        // 2% max slippage for $10k trade
  concentrationLimit: 0.5   // No single LP > 50%
};
```

## Alert Routing

```typescript
interface AlertRoute {
  level: RiskLevel;
  channels: ("discord" | "telegram" | "email")[];
  recipients: string[];
  requiresAck: boolean;
}

const ALERT_ROUTES: Record<RiskLevel, AlertRoute> = {
  GREEN: { level: "GREEN", channels: [], recipients: [], requiresAck: false },
  YELLOW: { level: "YELLOW", channels: ["discord"], recipients: ["team"], requiresAck: false },
  ORANGE: { level: "ORANGE", channels: ["discord", "telegram"], recipients: ["team", "chief"], requiresAck: true },
  RED: { level: "RED", channels: ["discord", "telegram", "email"], recipients: ["all"], requiresAck: true }
};
```

## Emergency Response

```typescript
// RED alerts trigger emergency protocol
async function triggerEmergencyProtocol(alert: Alert): Promise<void> {
  // 1. Notify all channels
  await broadcastAlert(alert);
  
  // 2. Prepare pause transaction (requires multisig)
  const pauseTx = await prepareEmergencyPause();
  
  // 3. Log to immutable audit trail
  await logEmergency(alert, pauseTx);
  
  // 4. Await Governor approval
  await requestGovernorApproval(pauseTx);
}
```
