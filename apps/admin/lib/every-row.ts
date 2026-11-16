const PAGE_SIZE = 1000;

/**
 * The API answers with a capped number of rows and does not say when it cut
 * the list, so one request cannot be trusted to hold everything. This asks for
 * the next rows until none come back, whatever the cap is.
 *
 * The query must sort on a unique key (end the order with the id), or a row can
 * be skipped or repeated between pages. A failed page throws: the caller
 * answers with an error instead of a short list.
 */
export async function everyRow<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
