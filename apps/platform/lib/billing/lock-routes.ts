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

/**
 * Where a wallet or billing line in the bell leads (Fermi B3 part 2). A line
 * that asks for money (the wallet runs low or out, an automatic refill failed,
 * a renewal the wallet cannot cover) opens the pay form; the rest open the
 * billing page, where a refused receipt shows why and sends again. Null for
 * every other line.
 */
export function billingNotificationPath(n: { type: string; payload: Record<string, unknown> }): string | null {
    switch (n.type) {
        case "finance.wallet_low":
        case "finance.wallet_empty":
        case "wallet.auto_refill_failed":
            return BILLING_PAY_PATH;
        case "billing.renewal_soon":
            return typeof n.payload.short === "number" && n.payload.short > 0 ? BILLING_PAY_PATH : BILLING_SETTINGS_PATH;
        case "wallet.topup_approved":
        case "wallet.topup_rejected":
            return BILLING_SETTINGS_PATH;
        default:
            return null;
    }
}
