// apps/platform/components/chat/order-thread-card.tsx
"use client";
import { useMemo } from "react";
import type { LinkedOrder } from "@/hooks/use-orders-by-id-query";
import type { OrderStatus } from "@/types/order";
import { Lock, Phone } from "lucide-react";
import { useOrderForConversation } from "@/hooks/chat/use-order-actions";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useLanguage } from "@/components/providers/language-provider";
import { formatIQD } from "@/lib/utils";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import { PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import { generateWhatsAppLink } from "@/lib/utils";
import type { PipelineStageId } from "@/lib/order-pipeline";
import { OrderActionBar } from "./order-action-bar";
import { usePresence } from "@/hooks/use-presence";
import { ChatAvatar } from "./chat-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";

interface OrderThreadCardProps {
    conversationId: string;
}

/**
 * "Visible to X, Y +2 · Add people" strip.
 *
 * Order threads are private to their members, which is the right default — an
 * order problem is not everyone's business — but an invisible default is a trap:
 * people posted into a thread nobody else belonged to and assumed it had been
 * seen. Naming the audience makes the privacy legible, and the Add control turns
 * "who else should see this?" into one click instead of a guess.
 */
function ThreadAudience({ conversationId, memberIds }: { conversationId: string; memberIds: string[] }) {
    const { t } = useLanguage();
    const { user } = useAuth();
    const { data: members = [] } = useTenantMembers();
    const openSettings = useChatStore((s) => s.openSettings);

    const names = memberIds
        .filter((id) => id !== user?.id)
        .map((id) => members.find((m) => m.user_id === id)?.display_name)
        .filter((n): n is string => !!n);

    const shown = names.slice(0, 2).join(", ");
    const extra = names.length - Math.min(names.length, 2);

    return (
        <div className="flex items-center gap-1.5 px-4 pb-2 text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
                {names.length === 0
                    ? t("chat.audienceOnlyYou", "Only you can see this thread")
                    : t("chat.audience", "Visible to you, {names}", {
                          names: extra > 0 ? `${shown} +${extra}` : shown,
                      })}
            </span>
            <button
                type="button"
                onClick={() => openSettings(conversationId)}
                className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground"
            >
                {t("chat.addPeople", "Add people")}
            </button>
        </div>
    );
}

/**
 * Pinned card rendered at the top of an order thread.
 * Shows live order data (status, total, customer) with quick-action links.
 * Falls back to a minimal header (conversation name) when the order isn't loaded yet.
 */
export function OrderThreadCard({ conversationId }: OrderThreadCardProps) {
    const { t } = useLanguage();
    const order = useOrderForConversation(conversationId);
    const { data: conversations = [] } = useConversations();

    const conv = conversations.find((c) => c.id === conversationId);
    const convName = conv?.name ?? t("chat.orderThread", "Order thread");

    const memberIds = useMemo(() => (conv?.members ?? []).map((m) => m.user_id), [conv]);

    // F1: per-resource presence on the order — uses the existing usePresence hook
    // (a separate channel keyed by orderId). Only active while this card is mounted,
    // i.e. while the order thread is open. Does NOT touch the tenant-wide channel.
    const orderId = conv?.order_id ?? null;
    const { otherUsers } = usePresence(orderId ?? "");

    // Presence is only meaningful when we have a real orderId; suppress the hook's
    // output when the conv has no order_id yet (loading / edge case).
    const viewers = orderId ? otherUsers : [];

    if (!order || !conv) {
        // Minimal header while order data is loading or not yet available
        return (
            <div className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">{convName}</span>
            </div>
        );
    }

    const statusMeta = PIPELINE_STAGE_REGISTRY[order.status as PipelineStageId];
    const statusLabel = statusMeta?.fallback ?? order.status;
    const waLink = order.phone ? generateWhatsAppLink(order.phone) : undefined;

    return (
        <div className="shrink-0 border-b border-(--card-border) bg-(--card-bg)">
            {/* Top row: order id + status chip + total */}
            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                <span className="text-[11px] font-mono font-semibold tracking-tight text-muted-foreground">
                    #{order.order_id}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${getStatusBadgeStyle(order.status as OrderStatus)}`}>
                    {statusLabel}
                </span>
                <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                    {order.price === null ? "" : formatIQD(order.price)}
                </span>
            </div>

            {/* Bottom row: customer name + quick-action buttons */}
            <div className="flex items-center gap-2 px-4 pb-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {order.customer_name}
                </span>

                {/* tel: quick-dial */}
                <a
                    href={`tel:${order.phone}`}
                    aria-label={t("chat.call", "Call customer")}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground active:scale-95"
                >
                    <Phone className="h-3.5 w-3.5" />
                </a>

                {/* WhatsApp quick link */}
                <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("chat.whatsapp", "WhatsApp customer")}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground active:scale-95"
                >
                    {/* WhatsApp icon (inline SVG to avoid external dep) */}
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                </a>
            </div>

            {/* F1: also-viewing cluster — shown when another teammate is looking at this order */}
            {viewers.length > 0 && (
                <div className="flex items-center gap-1.5 px-4 pb-1.5">
                    <span className="text-[10px] text-muted-foreground">
                        {t("chat.alsoViewing", "Also viewing")}
                    </span>
                    <div className="flex -space-x-1">
                        {viewers.slice(0, 5).map((v) => (
                            <ChatAvatar
                                key={v.id}
                                userId={v.id}
                                name={v.display_name}
                                avatarUrl={v.avatar_url}
                                size="xs"
                                ringClassName="ring-1 ring-(--card-bg)"
                            />
                        ))}
                    </div>
                    {viewers.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{viewers.length - 5}</span>
                    )}
                </div>
            )}

            {/* Who can actually read this thread. An order thread is private to its
                members — whoever opened it, the assigned agent, and anyone @mentioned
                (mentioning adds them). That was invisible before, so people wrote
                comments assuming the team would see them and nobody did. */}
            <ThreadAudience conversationId={conversationId} memberIds={memberIds} />

            {/* Action bar: status / assign / resolve */}
            <OrderActionBar order={order} conversation={conv} />
        </div>
    );
}
