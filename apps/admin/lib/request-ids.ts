/**
 * One id per distinct money or free-time request (a top-up, free days, lock
 * orders, a free unlock), made in the browser and sent with it. Asking for the
 * same payload again (a double click, a retry after an error or a lost
 * response) reuses the id, so the server makes the change once. A different
 * payload, or the same one after `done()`, gets a new id.
 *
 * Hold one per form where the form stays drawn: `const [requestIds] =
 * useState(createRequestIds)`. Where a form can be closed and opened again (the
 * shop page's panels), its page holds them, so the reopened form sends the same
 * ask with the same id (round 19).
 */
export function createRequestIds() {
  let last: { key: string; id: string } | null = null;
  return {
    idFor(key: string): string {
      if (last?.key !== key) last = { key, id: crypto.randomUUID() };
      return last.id;
    },
    done(): void {
      last = null;
    },
  };
}

export type RequestIds = ReturnType<typeof createRequestIds>;
