/**
 * What the Settings overview lists under "needs your attention", and the
 * number on the sidebar gear. Each item is backed by a rule the shop can fix
 * from Settings; anything still loading counts as fine, never as missing.
 */
import { walletRunway, type WalletRunway } from "@/lib/billing/wallet-runway";
import { isBillingExempt } from "@/lib/billing-exempt";

export type SettingsAttentionItem =
    | { kind: "wallet"; runway: WalletRunway; balanceIqd: number }
    | { kind: "staff-alerts" }
    | { kind: "whatsapp" };

export interface SettingsAttentionInput {
    /** The shop row's status and plan; null while loading. */
    tenant: { status: string; plan: string | null } | null;
    /** billing_lock_status; null while loading. `balance_iqd` is null for members who may not see the wallet. */
    lock: { locked: boolean; balance_iqd: number | null; daily_spend_iqd: number | null } | null;
    /** How many staff alert numbers are saved; null while loading. */
    staffAlertNumbers: number | null;
    /** The storefront WhatsApp number ("" when none); null while loading. */
    whatsappNumber: string | null;
}

export function settingsAttention(input: SettingsAttentionInput): SettingsAttentionItem[] {
    const items: SettingsAttentionItem[] = [];
    const { tenant, lock } = input;
    // As the Billing page decides it: only a paying shop that is not locked
    // hears its wallet runs low (the trial charges nothing, the lock screen
    // already says what to pay).
    if (tenant && lock && lock.balance_iqd !== null && tenant.status === "active" && !lock.locked && !isBillingExempt(tenant.plan)) {
        const runway = walletRunway(lock.balance_iqd, lock.daily_spend_iqd);
        if (runway) items.push({ kind: "wallet", runway, balanceIqd: lock.balance_iqd });
    }
    if (input.staffAlertNumbers === 0) items.push({ kind: "staff-alerts" });
    if (input.whatsappNumber !== null && input.whatsappNumber.trim() === "") items.push({ kind: "whatsapp" });
    return items;
}
