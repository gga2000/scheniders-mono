// apps/platform/components/chat/order-action-bar.tsx
"use client";
import { ChevronDown, CheckCircle, Circle } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStatusMutation } from "@/hooks/use-orders-query";
import { useSetConversationResolved } from "@/hooks/chat/use-order-actions";
import { PIPELINE_STAGE_IDS, PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import type { PipelineStageId } from "@/lib/order-pipeline";
import type { Order, OrderStatus } from "@/types/order";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { orderWriteErrorMessage } from "@/lib/order-status-guard";

interface OrderActionBarProps {
    order: Order;
    conversation: ConversationWithMeta;
}

/**
 * Compact action bar rendered inside the order-thread card.
 * Provides: status dropdown and resolve/unresolve toggle.
 */
export function OrderActionBar({ order, conversation }: OrderActionBarProps) {
    const { t } = useLanguage();
    const { profile } = useAuth();
    const { toast } = useToast();

    const updateStatus = useUpdateStatusMutation();
    const setResolved = useSetConversationResolved();

    const isResolved = conversation.resolved_at !== null;

    // ── Status dropdown ──────────────────────────────────────────────────────
    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value as OrderStatus;
        if (newStatus === order.status) return;
        updateStatus.mutate(
            {
                orderId: order.id,
                status: newStatus,
                last_status_changed_by_name: profile?.display_name ?? undefined,
                last_status_changed_by_avatar: profile?.avatar_url ?? undefined,
                expectedVersion: order.version,
            },
            {
                onError: (err) => {
                    toast({
                        title: t("chat.changeStatus", "Change status"),
                        description: orderWriteErrorMessage(err, t),
                        variant: "error",
                    });
                },
            }
        );
    };

    // ── Resolve toggle ───────────────────────────────────────────────────────
    const handleResolve = () => {
        setResolved.mutate(
            { conversationId: conversation.id, resolved: !isResolved },
            {
                onError: (err) => {
                    toast({
                        title: isResolved ? t("chat.unresolve", "Unresolve") : t("chat.resolve", "Resolve"),
                        description: err instanceof Error ? err.message : String(err),
                        variant: "error",
                    });
                },
            }
        );
    };

    return (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-(--card-border) bg-(--card-bg) px-4 py-2">
            {/* ── Status dropdown ── */}
            <div className="relative flex-1">
                <select
                    value={order.status}
                    onChange={handleStatusChange}
                    disabled={updateStatus.isPending}
                    aria-label={t("chat.changeStatus", "Change status")}
                    className="w-full appearance-none rounded-md border border-(--card-border) bg-background py-1 pl-2.5 pr-6 text-[11px] font-medium text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-(--ink)/30 disabled:opacity-50"
                >
                    {PIPELINE_STAGE_IDS.map((s) => {
                        const meta = PIPELINE_STAGE_REGISTRY[s];
                        return (
                            <option key={s} value={s}>
                                {meta?.fallback ?? s}
                            </option>
                        );
                    })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>

            {/* ── Resolve / unresolve toggle ── */}
            <button
                type="button"
                onClick={handleResolve}
                disabled={setResolved.isPending}
                aria-label={isResolved ? t("chat.unresolve", "Unresolve") : t("chat.resolve", "Resolve")}
                title={isResolved ? t("chat.unresolve", "Unresolve") : t("chat.resolve", "Resolve")}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                    isResolved
                        ? "border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        : "border-(--card-border) bg-background text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
            >
                {isResolved ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                    <Circle className="h-3.5 w-3.5" />
                )}
            </button>
        </div>
    );
}
