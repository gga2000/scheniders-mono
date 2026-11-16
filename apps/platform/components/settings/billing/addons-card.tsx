"use client";

import { useState } from "react";
import { Loader2, Minus, Monitor, Plus, Puzzle, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import type { PlanLimitsData } from "@/hooks/use-billing";
import {
    useAddonQuote,
    useApplyAddonChange,
    useTenantAddons,
    type AddonKind,
    type BillingRefusal,
} from "@/hooks/use-plan-change";
import { Warning } from "./plan-change-dialog";
import { refusalMessage } from "./plan-refusal";

/** set_addon_quantity accepts 0..50. */
const MAX_ADDONS = 50;

/**
 * Extra team members and POS branches on top of the plan (Team, Business).
 * Each row is a stepper; a changed row is reviewed in a dialog that shows the
 * database's quote before anything is bought.
 */
export function AddonsCard({ plan, paidMonth, canChange }: { plan: PlanLimitsData; paidMonth: boolean; canChange: boolean }) {
    const { t } = useLanguage();
    const { data: owned } = useTenantAddons();
    const [review, setReview] = useState<{ kind: AddonKind; quantity: number } | null>(null);

    const rows: { kind: AddonKind; price: number; included: number; icon: React.ReactNode }[] = [];
    if (plan.extra_member_price_iqd !== null) {
        rows.push({ kind: "extra_member", price: plan.extra_member_price_iqd, included: plan.max_team_members, icon: <UserPlus className="h-4 w-4" /> });
    }
    if (plan.pos_branch_price_iqd !== null) {
        rows.push({ kind: "pos_branch", price: plan.pos_branch_price_iqd, included: plan.pos_branches_included, icon: <Monitor className="h-4 w-4" /> });
    }
    if (rows.length === 0 || !owned) return null;

    return (
        <section className="pastel-card p-6" data-testid="addons-card">
            <div className="mb-1 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-blue)">
                    <Puzzle className="h-4 w-4 text-blue-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("addons.title")}</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{t(paidMonth ? "addons.subtitle" : "addons.subtitleTrial")}</p>

            <div className="divide-y divide-(--card-border)">
                {rows.map((row) => (
                    <AddonRow
                        key={`${row.kind}:${owned[row.kind]}`}
                        kind={row.kind}
                        icon={row.icon}
                        price={row.price}
                        included={row.included}
                        owned={owned[row.kind]}
                        canChange={canChange}
                        onReview={(quantity) => setReview({ kind: row.kind, quantity })}
                    />
                ))}
            </div>
            {!canChange && <p className="mt-3 text-xs text-muted-foreground">{t("addons.askOwner")}</p>}

            {review && <AddonChangeDialog kind={review.kind} quantity={review.quantity} onClose={() => setReview(null)} />}
        </section>
    );
}

function AddonRow({
    kind,
    icon,
    price,
    included,
    owned,
    canChange,
    onReview,
}: {
    kind: AddonKind;
    icon: React.ReactNode;
    price: number;
    included: number;
    owned: number;
    canChange: boolean;
    onReview: (quantity: number) => void;
}) {
    const { t } = useLanguage();
    const [draft, setDraft] = useState(owned);
    const changed = draft !== owned;
    const step = "flex h-8 w-8 items-center justify-center rounded-lg border border-(--card-border) text-foreground transition-colors hover:bg-muted/40 disabled:opacity-40";

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`addon-${kind}`}>
            <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{icon}</span>
                <div>
                    <p className="text-sm font-semibold text-foreground">{t(`addons.${kind}`)}</p>
                    <p className="text-xs text-muted-foreground">
                        {t(`addons.${kind}.note`, { amount: formatIQD(price), count: Math.max(0, included) })}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {canChange && (
                    <button type="button" className={step} onClick={() => setDraft((n) => Math.max(0, n - 1))} disabled={draft <= 0} aria-label={t("addons.less")}>
                        <Minus className="h-4 w-4" />
                    </button>
                )}
                <span className="w-8 text-center text-base font-bold tabular-nums text-foreground" data-testid={`addon-${kind}-qty`}>{draft}</span>
                {canChange && (
                    <button type="button" className={step} onClick={() => setDraft((n) => Math.min(MAX_ADDONS, n + 1))} disabled={draft >= MAX_ADDONS} aria-label={t("addons.more")}>
                        <Plus className="h-4 w-4" />
                    </button>
                )}
                {changed && (
                    <>
                        <button
                            type="button"
                            onClick={() => onReview(draft)}
                            className="ms-2 rounded-xl bg-foreground px-3 py-1.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                        >
                            {t("addons.review")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDraft(owned)}
                            className="rounded-xl px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            {t("addons.reset")}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function AddonChangeDialog({ kind, quantity, onClose }: { kind: AddonKind; quantity: number; onClose: () => void }) {
    const { t, language } = useLanguage();
    const quote = useAddonQuote(kind, quantity);
    const apply = useApplyAddonChange();
    const [refusal, setRefusal] = useState<BillingRefusal | null>(null);

    const result = quote.data;
    const shownRefusal = refusal ?? (result && !result.success ? result : null);
    const ready = result?.success ? result : null;
    const name = t(`addons.${kind}`);
    const title = ready
        ? t("addons.dialog.title", { name, from: ready.quantity_from, to: ready.quantity_to })
        : name;

    const confirm = () =>
        apply.mutate(
            { kind, quantity },
            {
                onSuccess: (res) => {
                    if (!res.success) {
                        setRefusal(res);
                        return;
                    }
                    toast({ title: t("addons.done"), variant: "success" });
                    onClose();
                },
                onError: () => toast({ title: t("plans.dialog.error"), variant: "error" }),
            },
        );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md" data-testid="addon-change-dialog">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="sr-only">{title}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {quote.isLoading ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("plans.dialog.loading")}
                        </p>
                    ) : quote.isError ? (
                        <Warning>{t("plans.dialog.error")}</Warning>
                    ) : shownRefusal ? (
                        <Warning>{refusalMessage(shownRefusal, t, language)}</Warning>
                    ) : ready ? (
                        <>
                            <p className="text-sm font-medium text-foreground">
                                {ready.quantity_to < ready.quantity_from
                                    ? t("addons.dialog.less")
                                    : ready.charge_now_iqd > 0
                                      ? t("addons.dialog.more", { amount: formatIQD(ready.charge_now_iqd) })
                                      : t("addons.dialog.moreLater")}
                            </p>
                            <p className="text-sm text-foreground">{t("addons.dialog.monthly", { amount: formatIQD(ready.monthly_iqd) })}</p>
                            {ready.charge_now_iqd > 0 && (
                                <p className="text-xs text-muted-foreground">{t("plans.dialog.balance", { amount: formatIQD(ready.balance_iqd) })}</p>
                            )}
                            {!ready.balance_ok && (
                                <Warning>{t("plans.dialog.short", { amount: formatIQD(ready.charge_now_iqd - ready.balance_iqd) })}</Warning>
                            )}
                        </>
                    ) : null}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!ready || !ready.balance_ok || !!refusal || apply.isPending}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        data-testid="addon-change-confirm"
                    >
                        {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("plans.dialog.confirm")}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-xl border border-(--card-border) py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
                    >
                        {t("plans.dialog.cancel")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
