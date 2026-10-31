/** The server returned fewer rows than it said exist, e.g. it capped the page below the one asked for. */
export class TruncatedResultError extends Error {
    constructor(readonly received: number, readonly expected: number) {
        super(`Received ${received} of ${expected} rows`);
    }
}

/**
 * Reads every row of a paged query. Each page reports the total match count; the
 * loop advances by the rows actually returned and fails loudly if it ends short,
 * so a server-side page cap can never pass as a complete result.
 */
export async function fetchAllPages<T>(
    fetchPage: (offset: number) => Promise<{ rows: T[]; total: number }>,
): Promise<T[]> {
    const all: T[] = [];
    let total = Infinity;
    while (all.length < total) {
        const page = await fetchPage(all.length);
        total = page.total;
        if (page.rows.length === 0) break;
        all.push(...page.rows);
    }
    if (all.length < total) throw new TruncatedResultError(all.length, total);
    return all;
}
