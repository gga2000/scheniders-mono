import { CALL_OUTCOME_LABELS, formatAgo, type SupportCall } from "@/lib/support";
import { cn } from "@/lib/utils";

const OUTCOME_TONE: Record<SupportCall["outcome"], string> = {
  done: "bg-emerald-500/15 text-[var(--ink-green)]",
  no_answer: "bg-amber-500/15 text-[var(--ink-amber)]",
  later: "bg-foreground/5 text-foreground-muted",
};

/** The last calls on a shop, so the next person knows what was said. */
export function SupportCallList({ calls, now }: { calls: SupportCall[]; now: number }) {
  return (
    <ul className="space-y-1.5">
      {calls.map((call) => (
        <li key={`${call.created_at}-${call.admin_name}`} className="text-[13px]">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", OUTCOME_TONE[call.outcome])}>
              {CALL_OUTCOME_LABELS[call.outcome]}
            </span>
            <span dir="auto" className="font-medium text-foreground">
              {call.admin_name}
            </span>
            <span className="text-xs text-foreground-muted">{formatAgo(call.created_at, now)}</span>
          </p>
          {call.note && (
            <p dir="auto" className="mt-0.5 text-foreground/80">
              {call.note}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
