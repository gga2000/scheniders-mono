"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { GovernorateOptions } from "@/components/orders/governorate-options";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { getGovernorateSelectOptions } from "@/lib/address-validator";
import type { PrimeDeskState } from "@/lib/prime/desk-state";
import { primePhone, primePhoneDigits } from "@/lib/prime/phone";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const fieldClass =
    "h-8 min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 text-xs text-foreground outline-none focus:border-[#315EA8]";
const saveClass =
    "h-8 shrink-0 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[var(--ink)]";

/**
 * The Prime line at the foot of a desk card: Prime's fee for the parcel and
 * where its hand-off stands («ينتظر», «يُسلَّم…», «#case ✓»). When Prime would
 * refuse the order as it stands — a 10-digit phone, no governorate — the fix
 * is right there: type it, save, and the desk checks the order again.
 */
export function PrimeDeskLine({ order, state, fee, onSaved }: { order: Order; state: PrimeDeskState | null; fee: number | null | undefined; onSaved: () => void }) {
    const { t } = useLanguage();

    if (state?.kind === "fix" && (state.reason === "bad_phone" || state.reason === "no_governorate")) {
        return <PrimeDeskFix order={order} reason={state.reason} onSaved={onSaved} />;
    }

    return (
        <div data-prime-desk={state?.kind ?? "checking"} className="flex items-center gap-2 border-t border-dashed border-[var(--card-border)] pt-1.5 text-xs">
            <span className="text-muted">{t("printing.prime.fee")}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">{fee === undefined || fee === null ? "—" : amountFormat.format(fee)}</span>
            <span className="flex-1" />
            {state === null ? (
                <span className="text-muted">…</span>
            ) : state.kind === "sent" ? (
                <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-[#165C39] dark:text-emerald-300">
                    #{state.caseId}
                    <Check className="h-3.5 w-3.5" aria-label={t("printing.prime.sent")} />
                </span>
            ) : state.kind === "sending" ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[#1F3F75] dark:text-sky-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t("printing.prime.sending")}
                </span>
            ) : state.kind === "waiting" ? (
                <span className="font-semibold text-muted">{t("printing.prime.waiting")}</span>
            ) : state.kind === "excel" ? (
                <span className="font-semibold text-muted" title={t("printing.prime.excelTip")}>{t("printing.prime.excel")}</span>
            ) : (
                <span className="truncate font-semibold text-[#8A4B00] dark:text-amber-300">{t(`printing.primeReason.${state.reason}`)}</span>
            )}
        </div>
    );
}

function PrimeDeskFix({ order, reason, onSaved }: { order: Order; reason: "bad_phone" | "no_governorate"; onSaved: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { updateOrder } = useOrdersContext();
    const [value, setValue] = useState(reason === "bad_phone" ? (order.phone ?? "") : "");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const save = async () => {
        let updates: Partial<Order>;
        if (reason === "bad_phone") {
            const phone = primePhone(value);
            if (!phone) {
                setProblem(t("printing.prime.phoneStillBad", { digits: primePhoneDigits(value) }));
                return;
            }
            updates = { phone };
        } else {
            const governorate = getGovernorateSelectOptions().find((g) => g.value === value);
            if (!governorate) {
                setProblem(t("printing.prime.pickGovernorate"));
                return;
            }
            updates = { city: governorate.value, governorate_code: governorate.code };
        }
        setBusy(true);
        setProblem(null);
        try {
            const saved = await updateOrder(order.id, updates);
            if (saved.success) onSaved();
            else setProblem(saved.error ?? t("printing.prime.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-prime-desk="fix" onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5 rounded-lg bg-[#FFFAF2] p-2 dark:bg-amber-400/[0.06]">
            <p dir={dir} className="text-left text-xs font-semibold text-[#8A4B00] dark:text-amber-300">
                {reason === "no_governorate"
                    ? t("printing.prime.noGovernorate")
                    : primePhoneDigits(order.phone) === 11
                      ? t("printing.prime.phonePrefix")
                      : t("printing.prime.phoneDigits", { digits: primePhoneDigits(order.phone) })}
            </p>
            <div className="flex items-center gap-1.5">
                {reason === "bad_phone" ? (
                    <input
                        type="tel"
                        inputMode="tel"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        aria-label={t("printing.prime.newPhone")}
                        className={cn(fieldClass, "font-mono tabular-nums")}
                    />
                ) : (
                    <select value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("printing.prime.governorate")} className={fieldClass}>
                        <option value="" disabled>
                            {t("printing.prime.governorate")}
                        </option>
                        <GovernorateOptions />
                    </select>
                )}
                <button type="button" onClick={save} disabled={busy} className={saveClass}>
                    {busy ? t("printing.prime.saving") : t("printing.prime.save")}
                </button>
            </div>
            {problem && (
                <p role="alert" dir={dir} className="text-left text-[11px] font-semibold text-[#B42318] dark:text-rose-300">
                    {problem}
                </p>
            )}
        </div>
    );
}
