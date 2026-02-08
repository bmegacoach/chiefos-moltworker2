---
name: layerzero-oapp
description: LayerZero OFT/OAPP integration patterns for cross-chain token monitoring
---

# LayerZero OAPP Integration

## Overview
Patterns for monitoring LayerZero Omnichain Fungible Tokens (OFT) and Omnichain Applications (OAPP).

## Base Chain Endpoints

```typescript
// LayerZero V2 Base Mainnet
const LZ_ENDPOINT_BASE = "0x1a44076050125825900e736c501f859c50fE728c";
const LZ_EID_BASE = 30184; // Base chain endpoint ID

// Common chain endpoint IDs
const CHAIN_EIDS = {
  ethereum: 30101,
  arbitrum: 30110,
  optimism: 30111,
  base: 30184,
  solana: 30168
};
```

## OFT Monitoring Pattern

```typescript
// Monitor OFT send/receive events
interface OFTEvent {
  guid: string;           // LayerZero message ID
  srcEid: number;         // Source chain endpoint ID
  dstEid: number;         // Destination chain endpoint ID
  sender: string;         // Sender address
  amountSentLD: bigint;   // Amount sent (local decimals)
  amountReceivedLD: bigint; // Amount received (local decimals)
}

// Event signatures
const OFT_SENT = "OFTSent(bytes32,uint32,address,uint256,uint256)";
const OFT_RECEIVED = "OFTReceived(bytes32,uint32,address,uint256)";
```

## Cross-Chain Supply Tracking

```typescript
async function getTotalSupplyAcrossChains(
  token: string,
  chains: number[]
): Promise<{ chain: number; supply: bigint }[]> {
  // Query each chain's OFT contract for local supply
  // Aggregate for total cross-chain supply
}
```

## Message Verification

LayerZero messages include:
- `guid`: Unique message identifier
- `nonce`: Per-pathway nonce for ordering
- `srcEid`: Source chain identifier
- `dstEid`: Destination chain identifier

Verify messages through LayerZero DVNs (Decentralized Verifier Networks).

## Error Handling

Common LayerZero errors:
- `LZ_InvalidEndpoint`: Wrong endpoint configuration
- `LZ_InsufficientFee`: Need more native gas for cross-chain
- `LZ_SlippageExceeded`: Token amount slippage too high
