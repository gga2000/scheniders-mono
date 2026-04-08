"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Package, MapPin, ChevronRight,
  CheckCircle, XCircle, Truck, Clock, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const STATUS_CONFIG: Record<string, { label: string; pastel: string; icon: React.ElementType; dot: string }> = {
  delivered:  { label: "تم التوصيل", pastel: "bg-(--pastel-green)/40 border-(--pastel-green) text-zinc-800",   icon: CheckCircle, dot: "bg-(--pastel-green)" },
  completed:  { label: "مكتمل",      pastel: "bg-(--pastel-green)/40 border-(--pastel-green) text-zinc-800",   icon: CheckCircle, dot: "bg-(--pastel-green)" },
  confirmed:  { label: "مؤكد",       pastel: "bg-(--pastel-blue)/40 border-(--pastel-blue) text-zinc-800",     icon: CheckCircle, dot: "bg-(--pastel-blue)" },
  in_transit: { label: "في الطريق",  pastel: "bg-(--pastel-mint)/40 border-(--pastel-mint) text-zinc-800",     icon: Truck,       dot: "bg-(--pastel-mint)" },
  rejected:   { label: "مرفوض",      pastel: "bg-(--pastel-pink)/40 border-(--pastel-pink) text-zinc-800",     icon: XCircle,     dot: "bg-(--pastel-pink)" },
  cancelled:  { label: "ملغي",       pastel: "bg-(--pastel-pink)/30 border-(--pastel-pink) text-zinc-800",     icon: XCircle,     dot: "bg-(--pastel-pink)" },
  new:        { label: "جديد",       pastel: "bg-(--pastel-yellow)/40 border-(--pastel-yellow) text-zinc-800", icon: Circle,      dot: "bg-(--pastel-yellow)" },
  contacted:  { label: "تم التواصل", pastel: "bg-(--pastel-mint)/30 border-(--pastel-mint) text-zinc-800",     icon: Clock,       dot: "bg-(--pastel-mint)" },
  suspended:  { label: "معلق",       pastel: "bg-(--pastel-yellow)/30 border-(--pastel-yellow) text-zinc-800", icon: Clock,       dot: "bg-(--pastel-yellow)" },
};

const DEFAULT_STATUS = { label: "غير معروف", pastel: "bg-background border-(--card-border) text-muted", icon: Circle, dot: "bg-(--card-border)" };

type FilterType = "all" | "delivered" | "confirmed" | "rejected" | "in_transit";

const FILTER_TABS: { value: FilterType; label: string }[] = [
  { value: "all",        label: "الكل" },
  { value: "delivered",  label: "تم التوصيل" },
  { value: "confirmed",  label: "مؤكد" },
  { value: "in_transit", label: "في الطريق" },
  { value: "rejected",   label: "مرفوض" },
];

function formatIQD(n: number) {
  return `${n.toLocaleString("ar-IQ")} د.ع`;
}

interface CustomerOrdersTabProps {
  orders: Order[];
  isLoading?: boolean;
}

export function CustomerOrdersTab({ orders, isLoading }: CustomerOrdersTabProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = filter === "all"
    ? orders
    : orders.filter((o) => {
        if (filter === "delivered") return o.status === "delivered" || o.status === "completed";
        return o.status === filter;
      });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-(--card-border) bg-(--card-bg) p-4 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-2xl bg-background" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-background" />
                <div className="h-2.5 w-48 rounded bg-background" />
              </div>
              <div className="h-5 w-16 rounded-full bg-background" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              "shrink-0 rounded-2xl px-3 py-1.5 text-xs font-medium transition-all duration-150",
              filter === tab.value
                ? "bg-foreground text-background shadow-sm"
                : "bg-background text-muted hover:bg-(--card-border)"
            )}
          >
            {tab.label}
            {tab.value === "all" && (
              <span className="mr-1.5 text-[10px] opacity-70">{orders.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Package className="h-10 w-10 text-muted" />
          <p className="text-sm text-muted">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {sorted.map((order, i) => {
              const cfg = STATUS_CONFIG[order.status] ?? DEFAULT_STATUS;
              const StatusIcon = cfg.icon;
              const itemsSummary = order.items
                .map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`)
                .join("، ");

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="group pastel-card px-4 py-3.5 cursor-pointer"
                  onClick={() => router.push(`/orders?order=${order.order_id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <div className={cn("mt-2 h-2 w-2 rounded-full shrink-0", cfg.dot)} />

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-muted">
                            #{order.order_id}
                          </span>
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            cfg.pastel
                          )}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ar })}
                        </span>
                      </div>

                      {/* Items */}
                      {itemsSummary && (
                        <p className="mt-1 text-xs text-muted truncate max-w-xs">
                          {itemsSummary}
                        </p>
                      )}

                      {/* Footer */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground tabular-nums">
                            {formatIQD(order.price)}
                          </span>
                          {(order.city || order.governorate_code) && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <MapPin className="h-3 w-3" />
                              {order.city || order.governorate_code}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
