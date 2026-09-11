// apps/platform/components/chat/order-action-bar.tsx
import type { LinkedOrder } from "@/hooks/use-orders-by-id-query";
"use client";
import { useState } from "react";
import { Check, ChevronDown, UserPlus, CheckCircle, Circle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui";
import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStatusMutation } from "@/hooks/use-orders-query";
import { useAssignOrder, useSetConversationResolved } from "@/hooks/chat/use-order-actions";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { ChatAvatar } from "./chat-avatar";
import { PIPELINE_STAGE_IDS, PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import type { PipelineStageId } from "@/lib/order-pipeline";
import type { Order, OrderStatus } from "@/types/order";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";

interface OrderActionBarProps {
    // PERF-D1: chat fetches the columns it reads, not whole orders.
    order: LinkedOrder;
    conversation: ConversationWithMeta;
}

/**
 * Compact action bar rendered inside the order-thread card.
 * Provides: status dropdown, assign picker, and resolve/unresolve toggle.
 */
export function OrderActionBar({ order, conversation }: OrderActionBarProps) {
    const { t } = useLanguage();
    const { profile } = useAuth();
    const { toast } = useToast();
    const [assignOpen, setAssignOpen] = useState(false);

    const updateStatus = useUpdateStatusMutation();
    const assignOrder = useAssignOrder();
    const setResolved = useSetConversationResolved();
    const { data: members = [] } = useTenantMembers();

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
                        description: err instanceof Error ? err.message : String(err),
                        variant: "error",
                    });
                },
            }
        );
    };

    // ── Assign ───────────────────────────────────────────────────────────────
    const handleAssign = (userId: string | null) => {
        setAssignOpen(false);
        assignOrder.mutate(
            { orderId: order.id, userId },
            {
                onError: (err) => {
                    toast({
                        title: t("chat.assign", "Assign"),
                        description: err instanceof Error ? err.message : String(err),
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

    const assignee = order.assigned_to ? members.find((m) => m.user_id === order.assigned_to) : null;

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

            {/* ── Assign popover ── */}
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={t("chat.assignTo", "Assign to…")}
                        disabled={assignOrder.isPending}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-(--card-border) bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                    >
                        {assignee ? (
                            <>
                                <ChatAvatar
                                    userId={assignee.user_id}
                                    name={assignee.display_name}
                                    avatarUrl={assignee.avatar_url}
                                    size="sm"
                                />
                                <span className="max-w-[72px] truncate">{assignee.display_name.split(" ")[0]}</span>
                            </>
                        ) : (
                            <>
                                <UserPlus className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">{t("chat.assign", "Assign")}</span>
                            </>
                        )}
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="w-52 border-(--card-border) bg-(--card-bg) p-1 shadow-lg"
                >
                    <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("chat.assignTo", "Assign to…")}
                    </p>

                    {/* Unassign option */}
                    {order.assigned_to && (
                        <button
                            type="button"
                            onClick={() => handleAssign(null)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/5"
                        >
                            <Circle className="h-3.5 w-3.5 shrink-0" />
                            {t("chat.unassigned", "Unassigned")}
                        </button>
                    )}

                    {members.map((m) => {
                        const isCurrentAssignee = order.assigned_to === m.user_id;
                        return (
                            <button
                                key={m.user_id}
                                type="button"
                                onClick={() => handleAssign(m.user_id)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground hover:bg-foreground/5"
                            >
                                <ChatAvatar
                                    userId={m.user_id}
                                    name={m.display_name}
                                    avatarUrl={m.avatar_url}
                                    size="sm"
                                />
                                <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                                {isCurrentAssignee && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                                )}
                            </button>
                        );
                    })}
                </PopoverContent>
            </Popover>

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
