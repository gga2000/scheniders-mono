/**
 * One id per distinct money request, made in the browser and sent with it.
 * Asking for the same payload again (a double click, a retry after an error or
 * a lost response) reuses the id, so the server credits once. A different
 * payload, or the same one after `done()`, gets a new id.
 *
 * Hold one per form: `const [requestIds] = useState(createRequestIds)`.
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
