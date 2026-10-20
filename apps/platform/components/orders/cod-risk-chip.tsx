import { AlertTriangle } from "lucide-react";
import { COD_RISK_REASON_LABELS, codRiskReasonsOf } from "@scheniders/shared";
import { cn } from "@/lib/utils";

/**
 * Amber chip for the COD risk signals the storefront stamps on an order at
 * checkout (`cod_risk_signals` → `attention_reasons`). Shares the column with
 * WhatsApp and delivery-review reasons, so only the COD-risk keys are read.
 * Renders nothing when the order carries none.
 *
 * `card` names the first reason and counts the rest; `row` is the compact
 * table marker. Both list every reason in the tooltip.
 */
export function CodRiskChip({
    needsAttention,
    attentionReasons,
    variant,
}: {
    needsAttention: boolean | null | undefined;
    attentionReasons: readonly string[] | null | undefined;
    variant: "card" | "row";
}) {
    if (!needsAttention) return null;
    const reasons = codRiskReasonsOf(attentionReasons);
    const [first, ...rest] = reasons;
    if (first === undefined) return null;
    const title = reasons.map((r) => COD_RISK_REASON_LABELS[r].ar).join(" · ");

    if (variant === "row") {
        return (
            <span
                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
                title={title}
                data-testid="cod-risk-chip"
            >
                <AlertTriangle className="w-3 h-3" aria-hidden />
                COD
            </span>
        );
    }

    return (
        <span
            className={cn(
                "inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold border",
                "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
            )}
            title={title}
            data-testid="cod-risk-chip"
        >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
            {COD_RISK_REASON_LABELS[first].ar}
            {rest.length > 0 && <span className="opacity-70">+{rest.length}</span>}
        </span>
    );
}
