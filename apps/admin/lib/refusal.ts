/**
 * The server's own words for a refused write ("A follow-up can only go to
 * ...", "This lead no longer exists."), else `fallback`. A body that is not
 * JSON (a gateway's error page) gives the fallback too.
 */
export async function refusal(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
}
