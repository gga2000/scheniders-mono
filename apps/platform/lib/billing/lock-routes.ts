/**
 * Which dashboard pages a billing-locked shop may still open (handoff A1):
 * its orders (list, details, confirm, ship), courier sending and Prime,
 * labels, export, returns, and the billing page to pay. Everything else
 * shows the lock screen.
 */
const OPEN_PREFIXES = ["/orders", "/printing", "/prime", "/shipping-export", "/returns"] as const;

export function isOpenWhileLocked(pathname: string | null | undefined, settingsSection: string | null | undefined): boolean {
    if (!pathname) return false;
    if (pathname === "/settings") return settingsSection === "billing";
    return OPEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The billing page, where a locked shop pays or tops up its wallet. */
export const BILLING_SETTINGS_PATH = "/settings?section=billing";

/** The billing page with the top-up form already open (Fermi B3 pay screen). */
export const BILLING_PAY_PATH = "/settings?section=billing&pay=1";
