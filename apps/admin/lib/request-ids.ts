/**
 * One id per distinct money or free-time request (a top-up, free days, lock
 * orders, a free unlock), made in the browser and sent with it. Asking for the
 * same thing again (a double click, a retry after an error or a lost
 * response) reuses the id, so the server makes the change once. A different
 * ask gets its own id; the same ask after `done()` gets a new one.
 *
 * Every ask keeps its id until a success, not only the last one: after a lost
 * answer for 50,000, a try at 10,000 and then 50,000 again sends the first
 * 50,000's id, so that money comes once (round 20). A success ends them all,
 * since the next press is a new ask.
 *
 * Key it by what moves: the shop, the amount, the days. Not by the reason's
 * words: a form opened again starts empty, and a reason typed anew in other
 * words must not turn a retry into a second top-up (round 20).
 *
 * Hold one per form where the form stays drawn: `const [requestIds] =
 * useState(createRequestIds)`. Where a form can be closed and opened again (the
 * shop page's panels), its page holds them, so the reopened form sends the same
 * ask with the same id (round 19).
 */
export function createRequestIds() {
  const ids = new Map<string, string>();
  return {
    idFor(key: string): string {
      const known = ids.get(key);
      if (known) return known;
      const id = crypto.randomUUID();
      ids.set(key, id);
      return id;
    },
    done(): void {
      ids.clear();
    },
  };
}

export type RequestIds = ReturnType<typeof createRequestIds>;
