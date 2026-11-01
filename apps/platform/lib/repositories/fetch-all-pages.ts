/**
 * The API caps every response at `max_rows` (1000 on this project) and returns
 * the first rows without any error, so a store past that size silently loses
 * products, variants, suppliers or costs. Read in pages until one comes back
 * short.
 */
export const PAGE_SIZE = 1000;

interface Page<Row> {
    data: Row[] | null;
    error: { message: string } | null;
}

export async function fetchAllPages<Row>(
    readPage: (from: number, to: number) => PromiseLike<Page<Row>>,
): Promise<Row[]> {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await readPage(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
    }
}
