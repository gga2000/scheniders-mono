// apps/platform/components/chat/reference-card.tsx
"use client";
import { ChevronRight, Package } from "lucide-react";
import { useOrderStore } from "@/store/use-order-store";
import { orderRepository } from "@/lib/repositories/order-repository";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";
import type { ChatReference } from "@/types/chat";

export function ReferenceCard({ reference }: { reference: ChatReference }) {
    const { openOrderDetails } = useOrderStore();
    const { t } = useLanguage();
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
                className="group mt-2 flex w-full max-w-[420px] items-center gap-3 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] py-2.5 pl-0 pr-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
            >
                <span className="flex w-1 self-stretch bg-amber-400" aria-hidden />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("chat.reference.order", "Order")}
                    </div>
                    <div className="truncate text-sm font-bold text-foreground">#{s.order_id}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.customer_name} · {s.phone}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-sm font-bold text-foreground">{formatIQD(Number(s.price ?? 0))}</div>
                    {s.status ? (
                        <div className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            {String(s.status)}
                        </div>
                    ) : null}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
        );
    }
    return (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-foreground">
            {reference.ref_type}: {String(s.label ?? reference.ref_id)}
        </div>
    );
}
