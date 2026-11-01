/**
 * The purchase order functions raise English messages. Show a translated
 * sentence chosen by the error's SQLSTATE instead of the raw database text.
 */
export function purchaseOrderErrorKey(err: unknown): string {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "42501") return "supplies.err.notAllowed";
    if (code === "22023") return "supplies.err.invalid";
    return "supplies.err.generic";
}
