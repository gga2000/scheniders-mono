"use client";

import { useState } from "react";
import { Switch } from "@scheniders/ui/switch";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useSaveTillRules, useTillRules } from "@/hooks/use-shops";
import { tillRulesSchema, type TillRules } from "@/lib/till/shop-forms";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";
const FIELD =
    "h-12 w-28 rounded-2xl border border-[var(--card-border)] bg-transparent px-4 text-right text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)] dark:focus:border-[#EFFF00]";

type NumberRule = "cashier_discount_pct" | "pay_later_default_limit" | "commission_pct" | "return_days" | "lock_after_minutes";
type Draft = Record<NumberRule, string> & Pick<TillRules, "pin_for_refunds" | "whatsapp_receipt_default">;

const NUMBER_RULES: { key: NumberRule; unit: string }[] = [
    { key: "cashier_discount_pct", unit: "%" },
    { key: "pay_later_default_limit", unit: "IQD" },
    { key: "commission_pct", unit: "%" },
    { key: "return_days", unit: "days" },
    { key: "lock_after_minutes", unit: "min" },
];

function toDraft(r: TillRules): Draft {
    return {
        cashier_discount_pct: r.cashier_discount_pct === null ? "" : String(r.cashier_discount_pct),
        pay_later_default_limit: r.pay_later_default_limit.toLocaleString("en-US"),
        commission_pct: String(r.commission_pct),
        return_days: String(r.return_days),
        lock_after_minutes: String(r.lock_after_minutes),
        pin_for_refunds: r.pin_for_refunds,
        whatsapp_receipt_default: r.whatsapp_receipt_default,
    };
}

/** Digits with an optional decimal part; anything else is not a number here. Commas are allowed in dinars. */
function toNumber(v: string): number {
    const clean = v.replace(/,/g, "").trim();
    return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : Number.NaN;
}

/** The store's till rules. Loads, then edits a local draft that is saved in one go. */
export function TillRulesCard() {
    const rules = useTillRules();
    return (
        <section className={`${CARD} p-5`}>
            {rules.isError ? (
                <RulesError />
            ) : rules.isPending ? (
                <div className="h-72 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
            ) : (
                <RulesForm initial={rules.data} />
            )}
        </section>
    );
}

function RulesError() {
    const { t } = useLanguage();
    return <p className="text-sm text-muted">{t("till.rules.loadFailed")}</p>;
}

function RulesForm({ initial }: { initial: TillRules }) {
    const { t } = useLanguage();
    const save = useSaveTillRules();
    const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
    const [bad, setBad] = useState<Partial<Record<NumberRule, true>>>({});
    const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(initial));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = tillRulesSchema.safeParse({
            ...draft,
            cashier_discount_pct: draft.cashier_discount_pct.trim() === "" ? null : toNumber(draft.cashier_discount_pct),
            pay_later_default_limit: toNumber(draft.pay_later_default_limit),
            commission_pct: toNumber(draft.commission_pct),
            return_days: toNumber(draft.return_days),
            lock_after_minutes: toNumber(draft.lock_after_minutes),
        });
        if (!parsed.success) {
            const next: Partial<Record<NumberRule, true>> = {};
            for (const issue of parsed.error.issues) next[issue.path[0] as NumberRule] = true;
            setBad(next);
            return;
        }
        save.mutate(parsed.data, {
            onSuccess: () => toast({ title: t("till.rules.saved"), variant: "success" }),
            onError: () => toast({ title: t("till.rules.saveFailed"), variant: "error" }),
        });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-foreground">{t("till.rules.title")}</h2>
            <p className="mb-3 text-sm text-muted">{t("till.rules.subtitle")}</p>

            {NUMBER_RULES.map(({ key, unit }) => (
                <label key={key} className="flex items-center justify-between gap-4 border-t border-[var(--card-border)] py-3">
                    <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{t(`till.rules.${key}`)}</span>
                        <span className={cn("text-left block text-xs", bad[key] ? "text-red-600" : "text-muted")} dir="auto">
                            {bad[key] ? t(`till.rules.${key}.error`) : t(`till.rules.${key}.hint`)}
                        </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                        <input
                            value={draft[key]}
                            onChange={(e) => {
                                setDraft((d) => ({ ...d, [key]: e.target.value }));
                                setBad((b) => ({ ...b, [key]: undefined }));
                            }}
                            inputMode="decimal"
                            placeholder={key === "cashier_discount_pct" ? t("till.rules.any") : undefined}
                            aria-invalid={bad[key] ? true : undefined}
                            className={cn(FIELD, bad[key] && "border-red-500")}
                        />
                        <span className="w-9 text-xs font-semibold text-muted">{t(`till.rules.unit.${unit}`)}</span>
                    </span>
                </label>
            ))}

            {(["pin_for_refunds", "whatsapp_receipt_default"] as const).map((key) => (
                <label key={key} className="flex min-h-12 items-center justify-between gap-4 border-t border-[var(--card-border)] py-3">
                    <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{t(`till.rules.${key}`)}</span>
                        <span className="text-left block text-xs text-muted" dir="auto">{t(`till.rules.${key}.hint`)}</span>
                    </span>
                    <Switch checked={draft[key]} onCheckedChange={(v) => setDraft((d) => ({ ...d, [key]: v }))} />
                </label>
            ))}

            <div className="mt-3 flex justify-end">
                <button
                    type="submit"
                    disabled={!dirty || save.isPending}
                    className="h-12 rounded-2xl bg-[var(--ink)] px-6 text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#EFFF00] dark:text-[#121212]"
                >
                    {save.isPending ? t("till.shops.saving") : t("till.rules.save")}
                </button>
            </div>
        </form>
    );
}
