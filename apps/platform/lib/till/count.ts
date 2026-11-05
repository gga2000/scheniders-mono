/**
 * Scan-to-count: the shelf as countable lines (one per size), and what a count
 * changes. Pure functions; the server sets the numbers (till_count_apply).
 */
import { lineKey, type TillProduct } from "./cart";

export interface CountLine {
    key: string;
    product_id: string;
    variant_id: string | null;
    name: string;
    variant_name: string | null;
    image_url: string | null;
    /** What stock says is there now. */
    expected: number;
}

/** One line per size (or per product with no sizes), in the order given. */
export function countLines(products: TillProduct[]): CountLine[] {
    return products.flatMap((p): CountLine[] =>
        p.variants.length
            ? p.variants.map((v) => ({
                  key: lineKey(p.id, v.id),
                  product_id: p.id,
                  variant_id: v.id,
                  name: p.name,
                  variant_name: p.variants.length > 1 ? v.name : null,
                  image_url: p.image_url,
                  expected: v.on_hand,
              }))
            : [{ key: lineKey(p.id, null), product_id: p.id, variant_id: null, name: p.name, variant_name: null, image_url: p.image_url, expected: p.on_hand }],
    );
}

export interface CountChange {
    line: CountLine;
    counted: number;
    /** counted − expected: below 0 is missing, above 0 is extra. */
    diff: number;
}

export interface CountSummary {
    /** Pieces counted so far. */
    scanned: number;
    /** Lines nobody counted yet. */
    notCounted: number;
    missing: number;
    extra: number;
    changes: CountChange[];
}

/**
 * What the count says. A line nobody counted is left alone, unless
 * `uncountedIsZero`: then the shelf was fully counted and it is not there.
 */
export function summarizeCount(lines: CountLine[], counts: ReadonlyMap<string, number>, uncountedIsZero: boolean): CountSummary {
    let scanned = 0;
    let notCounted = 0;
    let missing = 0;
    let extra = 0;
    const changes: CountChange[] = [];
    for (const line of lines) {
        const had = counts.get(line.key);
        if (had === undefined) notCounted += 1;
        else scanned += had;
        const counted = had ?? (uncountedIsZero ? 0 : null);
        if (counted === null || counted === line.expected) continue;
        const diff = counted - line.expected;
        if (diff < 0) missing -= diff;
        else extra += diff;
        changes.push({ line, counted, diff });
    }
    return { scanned, notCounted, missing, extra, changes };
}
