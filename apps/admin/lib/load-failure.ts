/**
 * Why a page's numbers did not arrive. A page that only knows "it failed"
 * shows zeros or "not found" for a server error, and a retry button to someone
 * whose role may never open the page.
 *
 * - signed_out: the sign-in ended (401)
 * - forbidden: this login may not open it (403)
 * - missing: nothing lives at this address (404)
 * - failed: the server or the connection broke; asking again can help
 */
export type LoadFailureKind = "signed_out" | "forbidden" | "missing" | "failed";

/** An API answer that was not a success, with the status the server gave. */
export class LoadFailure extends Error {
  readonly status: number;

  constructor(status: number, what: string) {
    super(`Could not load ${what}: the server answered ${status}`);
    this.name = "LoadFailure";
    this.status = status;
  }
}

const KIND_BY_STATUS: Record<number, LoadFailureKind> = {
  401: "signed_out",
  403: "forbidden",
  404: "missing",
};

export function loadFailureKind(error: unknown): LoadFailureKind {
  if (error instanceof LoadFailure) return KIND_BY_STATUS[error.status] ?? "failed";
  return "failed";
}

/** The same response when it is a success; a LoadFailure with its status when it is not. */
export function okOrLoadFailure(response: Response, what: string): Response {
  if (!response.ok) throw new LoadFailure(response.status, what);
  return response;
}

/** How often a failed read is asked again before the page says so. */
export const LOAD_RETRIES = 2;

/**
 * Whether asking again can change the answer. A refused login, an ended
 * sign-in and a missing record answer the same way every time, so the page
 * says so at once in place of three slow tries.
 */
export function shouldRetryLoad(failureCount: number, error: unknown): boolean {
  return loadFailureKind(error) === "failed" && failureCount < LOAD_RETRIES;
}

interface CountRead {
  /** The count, once the read has answered. */
  count: number | undefined;
  isError: boolean;
}

interface CountWords {
  loading: string;
  failed: string;
  counted: (count: number) => string;
}

/**
 * The line a page header writes about a count it read. "0 leads" while the
 * read is running, or after it failed, tells staff the list is empty when it
 * may be full; the header says which of the three it is.
 */
export function countLine({ count, isError }: CountRead, words: CountWords): string {
  if (isError) return words.failed;
  if (count === undefined) return words.loading;
  return words.counted(count);
}
