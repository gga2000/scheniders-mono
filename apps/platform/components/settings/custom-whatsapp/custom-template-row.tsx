"use client";

import { Loader2 } from "lucide-react";
import { Switch } from "@scheniders/ui/switch";
import {
    FERMI_ORDER_TEMPLATE_BODIES,
    customTemplateSubmitCategory,
    type CustomTemplatePurpose,
} from "@scheniders/shared/whatsapp-custom-templates";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import {
    useSwitchCustomTemplate,
    useWithdrawCustomTemplate,
    type CustomTemplateSlot,
} from "@/hooks/use-custom-whatsapp-templates";
import { cn, formatIQD } from "@/lib/utils";

export interface EditorStart {
    purpose: CustomTemplatePurpose;
    startBody: string;
    startsFromFermi: boolean;
}

interface CustomTemplateRowProps {
    purpose: CustomTemplatePurpose;
    slot: CustomTemplateSlot;
    priceIqd: number;
    /** The shop's owner or admin; everyone else only reads. */
    canEdit: boolean;
    onWrite: (start: EditorStart) => void;
}

/** One automatic message: which wording goes out now, where a request stands, and what the shop can do. */
export function CustomTemplateRow({ purpose, slot, priceIqd, canEdit, onWrite }: CustomTemplateRowProps) {
    const { t } = useLanguage();
    const withdraw = useWithdrawCustomTemplate();
    const switchUse = useSwitchCustomTemplate();
    const { live, open } = slot;
    // A refusal shows until the shop asks again or a newer wording is approved; a withdrawal is the shop's own act.
    const refused =
        !open && slot.ended && slot.ended.status !== "withdrawn" && (!live || slot.ended.created_at > live.created_at)
            ? slot.ended
            : null;
    const price = formatIQD(priceIqd);

    const lines: { text: string; tone: "ok" | "wait" | "bad" | "plain" }[] = [];
    if (live) lines.push({ text: t(live.in_use ? "customWa.state.liveOn" : "customWa.state.liveOff"), tone: live.in_use ? "ok" : "plain" });
    else if (!open && !refused) lines.push({ text: t("customWa.state.fermi"), tone: "plain" });
    if (open) lines.push({ text: t(open.status === "review" ? "customWa.state.review" : "customWa.state.atMeta"), tone: "wait" });
    if (refused) {
        const amount = formatIQD(refused.price_iqd);
        lines.push({ text: t(refused.status === "rejected" ? "customWa.state.rejectedMeta" : "customWa.state.rejectedFermi", { amount }), tone: "bad" });
        if (refused.reason) lines.push({ text: t("customWa.reason", { reason: refused.reason }), tone: "plain" });
    }
    if (live?.category === "marketing" && customTemplateSubmitCategory(purpose) === "utility") {
        lines.push({ text: t("customWa.state.marketing"), tone: "plain" });
    }

    const write = () => {
        if (refused) onWrite({ purpose, startBody: refused.body, startsFromFermi: false });
        else if (live) onWrite({ purpose, startBody: live.body, startsFromFermi: false });
        else onWrite({ purpose, startBody: FERMI_ORDER_TEMPLATE_BODIES[purpose], startsFromFermi: true });
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--card-border) p-4" data-testid={`custom-wa-${purpose}`}>
            <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">{t(`customWa.purpose.${purpose}`)}</p>
                {lines.map((line) => (
                    <p
                        key={line.text}
                        dir="auto"
                        className={cn(
                            "text-xs",
                            line.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
                            line.tone === "wait" && "text-amber-700 dark:text-amber-300",
                            line.tone === "bad" && "text-rose-600 dark:text-rose-400",
                            line.tone === "plain" && "text-muted-foreground",
                        )}
                    >
                        {line.text}
                    </p>
                ))}
            </div>

            {canEdit && (
                <div className="flex flex-wrap items-center gap-3">
                    {live && (
                        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                            {t("customWa.use")}
                            <Switch
                                checked={live.in_use}
                                disabled={switchUse.isPending}
                                onCheckedChange={(use) =>
                                    switchUse.mutate(
                                        { id: live.id, use },
                                        {
                                            onSuccess: () => toast.success(t(use ? "customWa.switchedOn" : "customWa.switchedOff")),
                                            onError: () => toast.error(t("customWa.problem.other")),
                                        },
                                    )
                                }
                            />
                        </label>
                    )}
                    {open?.status === "review" && (
                        <button
                            type="button"
                            disabled={withdraw.isPending}
                            onClick={() =>
                                withdraw.mutate(open.id, {
                                    onSuccess: () => toast.success(t("customWa.withdrawn")),
                                    onError: () => toast.error(t("customWa.problem.other")),
                                })
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-(--card-border) px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                        >
                            {withdraw.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {t("customWa.withdraw")}
                        </button>
                    )}
                    {!open && (
                        <button
                            type="button"
                            onClick={write}
                            className="rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                        >
                            {t(refused ? "customWa.writeAgain" : live ? "customWa.writeNew" : "customWa.write", { price })}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
