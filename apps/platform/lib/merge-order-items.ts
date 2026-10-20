// =============================================
// MERGE SPLIT ORDER LINES (display-time only)
//
// Until the ingest fix at the end of September 2026, LightFunnels orders were
// stored with one line per unit: three of the same perfume became three lines
// of quantity 1 instead of one line of quantity 3. Live on 2026-10-19 that was
// 99 LightFunnels orders across 9 tenants (2025-12-29 → 2026-09-12; none since
// October). On a card or a label "بيرسيفيرون ×1" printed three times reads as
// three different products and gets picked wrong.
//
// Stored rows are deliberately NOT rewritten. This collapses the lines where
// they are shown, printed or exported; editors keep the raw lines, because
// their actions address a line by its index in the stored array.
// =============================================

/**
 * The only field the merge reads by name. It is optional here because some
 * read models (the dashboard feed RPC) type it as nullable; such lines are
 * passed through, never summed.
 */
interface QuantifiedLine {
    quantity?: number | null;
}

/**
 * Canonical form of a value for identity comparison: object keys sorted,
 * `null`/`undefined` entries dropped (an absent field and an explicit `null`
 * both mean "no value"). Everything else is compared exactly — no trimming or
 * case folding — so two lines merge only when nothing about them differs.
 */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        for (const [key, entry] of entries) {
            if (entry === null || entry === undefined) continue;
            out[key] = canonical(entry);
        }
        return out;
    }
    return value;
}

/**
 * Identity of a line: every field except `quantity`. Product, variant, SKU,
 * unit price, open-box flag, tag, notes and anything a future ingest adds all
 * take part, so lines that differ in any of them are never collapsed.
 */
function lineKey(line: QuantifiedLine): string {
    const identity: Record<string, unknown> = { ...line };
    delete identity.quantity;
    return JSON.stringify(canonical(identity));
}

/**
 * Collapse lines that are identical except for `quantity` into one line whose
 * quantity is the sum. Order follows first appearance. A line whose quantity
 * is not a finite number is passed through untouched — summing it would invent
 * a quantity the order never had.
 *
 * Totals are preserved: Σ price × quantity and Σ quantity are the same before
 * and after, because only lines with the same unit price are combined.
 *
 * Pure: the input array and its objects are never mutated.
 */
export function mergeOrderItems<T extends QuantifiedLine>(items: readonly T[] | null | undefined): T[] {
    if (!Array.isArray(items)) return [];

    const merged: T[] = [];
    /** Position in `merged` and running quantity, per line identity. */
    const groups = new Map<string, { at: number; quantity: number }>();

    for (const item of items) {
        const quantity = item.quantity;
        if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
            merged.push(item);
            continue;
        }
        const key = lineKey(item);
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { at: merged.length, quantity });
            merged.push(item);
            continue;
        }
        group.quantity += quantity;
        merged[group.at] = { ...merged[group.at], quantity: group.quantity };
    }

    return merged;
}
