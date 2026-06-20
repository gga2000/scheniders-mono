// apps/platform/components/chat/reference-card.tsx
"use client";
import { useOrderStore } from "@/store/use-order-store";
import { orderRepository } from "@/lib/repositories/order-repository";
import { formatIQD } from "@/lib/utils";
import type { ChatReference } from "@/types/chat";

export function ReferenceCard({ reference }: { reference: ChatReference }) {
    const { openOrderDetails } = useOrderStore();
    const s = reference.snapshot as Record<string, string | number | undefined>;

    const onClick = async () => {
        if (reference.ref_type === "order") {
            const order = await orderRepository.findById(reference.ref_id);
            if (order) openOrderDetails(order);
        }
        // customer/product: navigate (executor wires routes), out of scope for first cut
    };

    if (reference.ref_type === "order") {
        return (
            <button
                onClick={onClick}
                className="mt-2 flex w-full max-w-[420px] items-center justify-between rounded-xl border border-black/10 bg-[var(--card-bg)] px-3 py-2.5 text-left transition hover:shadow-md"
                style={{ borderLeft: "4px solid #f59e0b" }}
            >
                <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Order</div>
                    <div className="truncate text-sm font-bold">#{s.order_id}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.customer_name} · {s.phone}</div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold">{formatIQD(Number(s.price ?? 0))}</div>
                    <div className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">{String(s.status ?? "")}</div>
                </div>
            </button>
        );
    }
    return <div className="mt-2 rounded-lg border px-3 py-2 text-xs">{reference.ref_type}: {String(s.label ?? reference.ref_id)}</div>;
}
