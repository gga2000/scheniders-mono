import { cn } from "@/lib/utils";
import type { ShopStatusLine, ShopTone } from "@/lib/shop-status";

const DOT: Record<ShopTone, string> = {
  paying: "bg-emerald-600",
  trial: "bg-amber-500",
  locked: "bg-rose-600",
  paused: "bg-orange-500",
  hold: "bg-zinc-500",
  ended: "bg-zinc-400",
  internal: "bg-zinc-800 dark:bg-zinc-200",
};

/** Where the shop stands in one line, and on the next line what happens next. */
export function ShopStatus({ line, planLabel }: { line: ShopStatusLine; planLabel: string }) {
  return (
    <div className="min-w-0" data-testid="shop-status">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-0.5 text-[13px] font-semibold">
          <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[line.tone])} />
          {line.label}
        </span>
        <span className="text-[13px] text-foreground/60">{planLabel}</span>
        <span>{line.sentence}</span>
      </p>
      {line.next && <p className="mt-1.5 text-[15px] font-semibold text-foreground">{line.next}</p>}
    </div>
  );
}
