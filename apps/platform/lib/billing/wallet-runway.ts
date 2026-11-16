/**
 * How long a paying shop's wallet lasts (Fermi B3 part 2), by the rule the bell
 * follows in the database (log_wallet_notification,
 * 20261116064916_fermi_wallet_runway_and_renewal_reminder.sql): a shop is told
 * only when its balance is under 3 days of its own spend, or gone. A shop that
 * spends nothing day to day (no delivered-order fees, no WhatsApp messages in
 * the last 7 days) has nothing running out.
 */
export const WALLET_WARN_DAYS = 3;

export type WalletRunway = { kind: "empty" } | { kind: "low"; days: number };

export function walletRunway(balanceIqd: number, dailySpendIqd: number | null): WalletRunway | null {
    if (dailySpendIqd === null || dailySpendIqd <= 0) return null;
    if (balanceIqd <= 0) return { kind: "empty" };
    if (balanceIqd >= WALLET_WARN_DAYS * dailySpendIqd) return null;
    return { kind: "low", days: Math.floor(balanceIqd / dailySpendIqd) };
}
