/**
 * The purchase order functions raise English messages. Show a translated
 * sentence chosen by the error's SQLSTATE instead of the raw database text.
 */
export function purchaseOrderErrorKey(err: unknown): string {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    const message = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "";
    if (code === "42501") return "supplies.err.notAllowed";
    if (code === "22023" && message.includes("already saved with other quantities")) return "supplies.err.alreadyReceived";
    if (code === "22023") return "supplies.err.invalid";
    // Another tab or member made this supplier's draft first.
    if (code === "23505" && message.includes("purchase_orders_one_draft_per_supplier")) return "supplies.err.draftExists";
    return "supplies.err.generic";
}
