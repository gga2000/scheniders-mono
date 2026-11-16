import { planName } from "@scheniders/shared/plans";
import { formatIQD } from "@/lib/utils";
import type { useLanguage } from "@/hooks/use-language";
import type { BillingRefusal } from "@/hooks/use-plan-change";

type Translate = ReturnType<typeof useLanguage>["t"];
type Locale = ReturnType<typeof useLanguage>["language"];

/** Why change_plan or set_addon_quantity said no, in the shop's words. */
export function refusalMessage(refusal: BillingRefusal, t: Translate, locale: Locale): string {
    const plan = planName(refusal.plan, locale);
    switch (refusal.error) {
        case "too_many_members":
            return t("plans.refuse.too_many_members", { used: refusal.seats_used ?? 0, limit: refusal.seat_limit ?? 0, plan });
        case "too_many_branches":
            return t("plans.refuse.too_many_branches", { used: refusal.branches_used ?? 0, limit: refusal.branch_limit ?? 0, plan });
        case "in_use":
            return t("plans.refuse.in_use", { used: refusal.in_use ?? 0, limit: refusal.limit ?? 0 });
        case "insufficient_balance":
            return t("plans.refuse.insufficient_balance", {
                balance: formatIQD(refusal.balance_iqd ?? 0),
                amount: formatIQD(refusal.charge_now_iqd ?? 0),
            });
        default:
            return t(`plans.refuse.${refusal.error}`, t("plans.dialog.error"));
    }
}
