export type ConsentRequestSummary = {
    /** Where the browser lands after the user decides. The client NAME is chosen by whoever registered it, so this is what the user can actually trust. */
    redirectHost: string;
    /** http redirect to a non-loopback host: the authorization code would travel in clear text. */
    insecureRedirect: boolean;
    scopes: string[];
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function describeConsentRequest(details: { redirect_uri: string; scope: string }): ConsentRequestSummary {
    const scopes = details.scope.split(/\s+/).filter(Boolean);
    try {
        const url = new URL(details.redirect_uri);
        if (url.protocol === "http:" || url.protocol === "https:") {
            return {
                redirectHost: url.host,
                insecureRedirect: url.protocol === "http:" && !LOOPBACK.has(url.hostname),
                scopes,
            };
        }
        // Custom app schemes (cursor://, vscode://): show scheme and authority as registered.
        return { redirectHost: `${url.protocol}//${url.host}`, insecureRedirect: false, scopes };
    } catch {
        return { redirectHost: details.redirect_uri, insecureRedirect: true, scopes };
    }
}
