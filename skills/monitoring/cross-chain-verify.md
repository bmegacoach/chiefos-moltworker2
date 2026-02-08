---
name: cross-chain-verify
description: LayerZero cross-chain message verification
---

# Cross-Chain Verification

## Overview
Verify LayerZero messages for secure cross-chain operations.

## Message Structure

```typescript
interface LayerZeroMessage {
  guid: string;              // Unique message ID
  nonce: bigint;            // Per-pathway nonce
  srcEid: number;           // Source endpoint ID
  srcAddress: string;       // Source contract
  dstEid: number;           // Destination endpoint ID
  dstAddress: string;       // Destination contract
  payload: string;          // Encoded message data
  status: "PENDING" | "DELIVERED" | "FAILED";
}
```

## Verification Steps

```typescript
async function verifyMessage(msg: LayerZeroMessage): Promise<boolean> {
  // 1. Check DVN attestations
  const dvnVerified = await checkDVNAttestations(msg.guid);
  if (!dvnVerified) return false;
  
  // 2. Verify nonce ordering
  const expectedNonce = await getExpectedNonce(msg.srcEid, msg.dstEid);
  if (msg.nonce !== expectedNonce) {
    await logNonceAnomaly(msg);
    return false;
  }
  
  // 3. Validate payload structure
  const validPayload = await validatePayload(msg.payload, msg.srcEid);
  if (!validPayload) return false;
  
  // 4. Check for duplicate processing
  const processed = await isAlreadyProcessed(msg.guid);
  if (processed) return false;
  
  return true;
}
```

## DVN Attestation Check

```typescript
// LayerZero uses Decentralized Verifier Networks
const REQUIRED_DVNS = [
  "0x...", // Google Cloud DVN
  "0x...", // LayerZero Labs DVN
];

async function checkDVNAttestations(guid: string): Promise<boolean> {
  const attestations = await getDVNAttestations(guid);
  
  // Require attestation from all configured DVNs
  for (const dvn of REQUIRED_DVNS) {
    if (!attestations.some(a => a.dvn === dvn && a.verified)) {
      return false;
    }
  }
  return true;
}
```

## Anomaly Detection

```typescript
interface CrossChainAnomaly {
  type: "NONCE_GAP" | "DUPLICATE" | "INVALID_SENDER" | "DVN_FAILURE";
  message: LayerZeroMessage;
  timestamp: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

async function detectAnomalies(msg: LayerZeroMessage): Promise<CrossChainAnomaly[]> {
  const anomalies: CrossChainAnomaly[] = [];
  
  // Check for nonce gaps
  const lastNonce = await getLastProcessedNonce(msg.srcEid, msg.dstEid);
  if (msg.nonce > lastNonce + 1n) {
    anomalies.push({
      type: "NONCE_GAP",
      message: msg,
      timestamp: Date.now(),
      severity: "HIGH"
    });
  }
  
  return anomalies;
}
```

## Message Tracking

```typescript
// Store verified messages for audit trail
async function trackMessage(msg: LayerZeroMessage): Promise<void> {
  const key = `crosschain/${msg.srcEid}-${msg.dstEid}/${msg.guid}.json`;
  await R2.put(key, JSON.stringify({
    ...msg,
    verifiedAt: Date.now(),
    verifier: "governor-agent"
  }));
}
```
