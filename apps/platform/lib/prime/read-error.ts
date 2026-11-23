/**
 * A Prime read our server could not make, with the reason its route gave
 * («prime_unreachable»: Prime is silent; «prime_rejected»: Prime answered
 * no), or null when the answer carried none (our own failure).
 */
export class PrimeReadError extends Error {
    constructor(
        readonly reason: string | null,
        readonly status: number,
        what: string,
    ) {
        super(`${what} failed: ${status}${reason ? ` (${reason})` : ""}`);
        this.name = "PrimeReadError";
    }
}

/** The error for a failed Prime route answer, keeping the reason from its body. */
export async function primeReadError(res: Response, what: string): Promise<PrimeReadError> {
    const body: unknown = await res.json().catch(() => null);
    const reason = typeof body === "object" && body !== null && "reason" in body && typeof body.reason === "string" ? body.reason : null;
    return new PrimeReadError(reason, res.status, what);
}

/**
 * Whether to ask again (up to the app's usual 2 retries). Not once Prime has
 * refused: it gives the same answer until someone changes the login, so a
 * retry only keeps the screen waiting. A silent Prime may answer next time.
 */
export function retryPrimeRead(failures: number, err: unknown): boolean {
    return failures < 2 && !(err instanceof PrimeReadError && err.reason === "prime_rejected");
}
