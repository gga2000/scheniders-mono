/**
 * Extract an order_id from a scanned or pasted value.
 *
 * Labels encode either the raw order_id (Code-128 barcode) or
 * "QR:{order_id}|PHONE:{phone}" (QR code). For any other text (a name, phone,
 * or a plain id) this just returns the trimmed input unchanged, so it's safe to
 * run on every search query.
 */
export function extractScannedOrderId(raw: string): string {
    if (!raw) return "";
    const m = raw.match(/QR:([^|]+)/i);
    return (m ? m[1] : raw).trim();
}
