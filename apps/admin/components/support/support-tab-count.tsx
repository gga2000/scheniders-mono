import type { MenuBadge } from "@/lib/admin-menu";
import { cn } from "@/lib/utils";

/**
 * The count on a Support tab. A read that failed shows "?" and says so, as the
 * menu's counts do: a missing count would read as nothing waiting.
 */
export function SupportTabCount({ badge, tone }: { badge: MenuBadge; tone: string }) {
  if (badge.count === 0) return null;
  const failed = badge.count === null;
  return (
    <span
      aria-label={badge.label}
      title={failed ? badge.label : undefined}
      className={cn(
        "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
        failed ? "bg-foreground/10 text-foreground-muted" : tone,
      )}
    >
      {failed ? "?" : badge.count}
    </span>
  );
}
