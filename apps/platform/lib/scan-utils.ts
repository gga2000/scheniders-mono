/**
 * Extract an order reference from a scanned or pasted value.
 *
 * Labels encode the reference several ways:
 *   - the raw order_id (Code-128 barcode),
 *   - "QR:{ref}|PHONE:{phone}" (invoice QR), or
 *   - "ORDER:{ref}|PHONE:{phone}" (shipping-label QR).
 * Strip either prefix and drop the trailing "|PHONE:…" segment. For any other
 * text (a name, phone, or a plain id/sequence number) this returns the trimmed
 * input unchanged, so it's safe to run on every search query.
 */
export function extractScannedOrderId(raw: string): string {
    if (!raw) return "";
    const m = raw.match(/(?:QR|ORDER):([^|]+)/i);
    return (m ? m[1] : raw).trim();
}
