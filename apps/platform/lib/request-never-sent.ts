/**
 * Whether a fetch() that threw certainly never reached the server: the name
 * did not resolve or the connection was refused. Only then is retrying a
 * POST safe. A timeout or a dropped connection can come after the server
 * already acted (queued a WhatsApp message, created a parcel), so a retry
 * there can do the paid thing twice.
 */
const NEVER_SENT_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

export function requestNeverSent(err: unknown): boolean {
    const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? (cause as { code: unknown }).code : undefined;
    return typeof code === "string" && NEVER_SENT_CODES.has(code);
}

/** Outside providers answer in seconds; past this a request is treated as lost. */
export const PROVIDER_TIMEOUT_MS = 15_000;
