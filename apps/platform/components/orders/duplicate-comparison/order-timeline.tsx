import { cn } from "@/lib/utils";
import { getBaseOrderId } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

export function OrderTimeline({
  orders,
  currentOrderId,
  label,
  relativeTime,
}: {
  orders: Order[];
  currentOrderId: string;
  label: string;
  relativeTime: (iso: string) => string;
}) {
  if (orders.length < 2) return null;
  const ordered = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="px-5 py-2 border-b border-dashed border-[var(--card-border)]">
      <div className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)] mb-1.5">
        {label}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto">
        {ordered.map((o, idx) => {
          const isCurrent = o.id === currentOrderId;
          return (
            <div key={o.id} className="flex items-center gap-1 flex-shrink-0">
              {idx > 0 && <div className="w-5 h-px bg-[var(--card-border)]" />}
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md border",
                  isCurrent
                    ? "bg-[var(--pastel-yellow)]/30 border-[var(--pastel-yellow)]/50 dark:bg-[rgba(239,255,0,0.1)] dark:border-[rgba(239,255,0,0.3)]"
                    : "bg-[var(--card-bg)] border-[var(--card-border)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
                )}
              >
                <span className="text-[9px] font-mono text-[var(--foreground-muted)]">
                  #{getBaseOrderId(o.order_id)}
                </span>
                <span className="text-[9px] text-[var(--foreground-subtle)]">
                  {relativeTime(o.created_at)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
