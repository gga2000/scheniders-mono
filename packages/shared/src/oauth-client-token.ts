/**
 * Access tokens that Supabase Auth's OAuth 2.1 server issues to a third-party
 * client (the Claude connector) carry a `client_id` claim; the apps' own
 * session tokens do not. Such a token is accepted only by the platform's
 * /api/mcp endpoint. Every other server entry point refuses it, so the token
 * cannot reach code that checks the user and then acts with the service role.
 *
 * The payload is decoded without verifying the signature. That is safe here
 * because the result is only ever used to refuse a token: removing the claim
 * would break the signature, and `getUser()` would reject the token anyway.
 */
export function oauthClientIdOf(accessToken: string): string | null {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    let claims: unknown;
    try {
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        claims = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")));
    } catch {
        // Not a JWT payload: no client claim to read. Verification decides the rest.
        return null;
    }
    if (typeof claims !== "object" || claims === null || !("client_id" in claims)) return null;
    const clientId = claims.client_id;
    return typeof clientId === "string" && clientId !== "" ? clientId : null;
}

export function isOAuthClientToken(accessToken: string): boolean {
    return oauthClientIdOf(accessToken) !== null;
}
