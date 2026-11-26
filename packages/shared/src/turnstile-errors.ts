/**
 * What a Cloudflare Turnstile client error code means for the page showing the
 * box (https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/).
 *
 * - `setup`: the widget is set up wrong for this page: the site key is unknown
 *   or disabled, or this web address is not on the widget's hostname list
 *   (110200, seen when app.usefermi.com went live before it was added).
 *   Nothing the visitor does helps, retrying only downloads the challenge
 *   again, and the team has to fix it in Cloudflare.
 * - `browser`: this browser cannot run the check (unsupported, or it hides
 *   what it is). Retrying the same browser does not help; another one might.
 * - `transient`: a network hiccup, a timeout or a failed challenge. Turnstile
 *   retries these on its own.
 */
export type TurnstileErrorKind = "setup" | "browser" | "transient";

const SETUP_CODES = new Set([
    "110100", // invalid site key
    "110110", // invalid site key
    "110200", // web address not on the widget's hostname list
    "110420", // invalid action
    "110430", // invalid cData
    "400020", // invalid site key
    "400030", // invalid size
    "400040", // invalid theme
    "400070", // site key disabled
]);

const BROWSER_CODES = new Set([
    "110500", // unsupported browser
    "110510", // inconsistent user agent (spoofing extension)
]);

export function turnstileErrorKind(code: string | null | undefined): TurnstileErrorKind {
    const value = (code ?? "").trim();
    if (SETUP_CODES.has(value)) return "setup";
    if (BROWSER_CODES.has(value)) return "browser";
    return "transient";
}
