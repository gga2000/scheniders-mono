import { cn } from "@/lib/utils";
import { getBaseOrderId } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import type { Order } from "@/lib/supabase";
import type { ReactNode } from "react";

export function OrderTimeline({
  orders,
  currentOrderId,
  displayedIds,
  toggleableIds,
  onToggle,
  rightSlot,
  formatDate,
}: {
  orders: Order[];
  currentOrderId: string;
  displayedIds: string[];
  toggleableIds: string[];
  onToggle: (id: string) => void;
  rightSlot?: ReactNode;
  formatDate: (iso: string) => string;
}) {
  if (orders.length < 2) return null;
  const ordered = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="px-5 py-1.5 border-b border-dashed border-[var(--card-border)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pt-2.5 pb-1 pr-2 flex-1">
        {ordered.map((o, idx) => {
          const isCurrent = o.id === currentOrderId;
          const toggleable = !isCurrent && toggleableIds.includes(o.id);
          const shown = isCurrent || displayedIds.includes(o.id);

          const inner = (
            <>
              <span className="text-[11px] font-mono text-[var(--foreground-muted)]">
                #{getBaseOrderId(o.order_id)}
              </span>
              <span className="text-[11px] text-[var(--foreground-subtle)]">
                {formatDate(o.created_at)}
              </span>
            </>
          );

          const baseCls =
            "relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-md border transition-all";

          return (
            <div key={o.id} className="flex items-center gap-1 flex-shrink-0">
              {idx > 0 && <div className="w-4 h-px bg-[var(--card-border)]" />}
              {isCurrent ? (
                <div
                  className={cn(
                    baseCls,
                    "bg-[var(--pastel-yellow)]/30 border-[var(--pastel-yellow)]/50 dark:bg-[rgba(239,255,0,0.1)] dark:border-[rgba(239,255,0,0.3)]",
                  )}
                >
                  {inner}
                </div>
              ) : toggleable ? (
                <button
                  type="button"
                  onClick={() => onToggle(o.id)}
                  className={cn(
                    baseCls,
                    "cursor-pointer",
                    shown
                      ? "bg-emerald-50/70 border-emerald-300 dark:bg-[rgba(0,255,100,0.08)] dark:border-[rgba(0,255,100,0.35)]"
                      : "border-dashed border-gray-300 opacity-45 bg-transparent hover:opacity-90 dark:border-[#3F3F3F]",
                  )}
                >
                  {inner}
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center",
                      shown
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-300 text-gray-600 dark:bg-[#444] dark:text-[#999]",
                    )}
                  >
                    {shown ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                  </span>
                </button>
              ) : (
                <div
                  className={cn(
                    baseCls,
                    "bg-[var(--card-bg)] border-[var(--card-border)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F] opacity-70",
                  )}
                >
                  {inner}
                </div>
              )}
            </div>
          );
        })}
        </div>
        {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}
