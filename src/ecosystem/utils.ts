// Ecosystem Utilities
// Shared helpers for the Ecosystem Manager

/**
 * Serialize data with BigInt support
 * JSON.stringify cannot handle BigInt natively, this converts them to strings
 */
export function serializeWithBigInt(data: unknown): string {
    return JSON.stringify(data, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );
}
