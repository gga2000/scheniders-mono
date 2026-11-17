"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { formatDayTime, formatUntilDay } from "@/lib/format";
import { pauseLiftOverdue } from "@/lib/tenant-pause";
import type { TenantRestrictions } from "@/types/admin";
import { postJson } from "./action-ui";

interface LimitedBannerProps {
  merchantId: string;
  restrictions: TenantRestrictions | null | undefined;
}

const BLOCK_LABEL: Record<keyof NonNullable<TenantRestrictions["blocks"]>, string> = {
  new_orders: "new orders",
  new_products: "new products",
  team_invites: "team invites",
  storefront_writes: "storefront edits",
};

/**
 * A paused shop: what stops, when the pause lifts on its own, and a button to
 * lift it now for whoever may. Who paused it and why is in the status line.
 */
export function LimitedBanner({ merchantId, restrictions }: LimitedBannerProps) {
  const queryClient = useQueryClient();
  const { role } = useAdminAuth();
  const now = new Date(useLiveTick(60_000));

  const lift = useMutation({
    mutationFn: () => postJson(`/api/merchants/${merchantId}/unpause`, {}),
    // Also after a failure: "This shop is not paused" means someone else lifted it, and the record is stale.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  const until = restrictions?.paused_until ?? null;
  const blocks = restrictions?.blocks ?? {};
  const stopped = (Object.keys(BLOCK_LABEL) as Array<keyof typeof BLOCK_LABEL>).filter((key) => blocks[key] === true);
  const what = stopped.length ? stopped.map((key) => BLOCK_LABEL[key]).join(", ") : "nothing yet";
  const canLift = role ? hasPermission(role, "reactivate_tenant") : false;
  const ended = !!until && new Date(until).getTime() <= now.getTime();
  // The hourly lift takes an ended pause off within the hour; past that it failed for this shop.
  const endedLine = !until || !ended
    ? null
    : pauseLiftOverdue(until, now.getTime())
      ? `The pause has ended but did not lift on its own: nothing is stopped now. ${
          canLift ? "Lift the pause now to clear it." : "Ask a super admin to lift it."
        }`
      : "The pause has ended: nothing is stopped now. It lifts on its own within the hour.";

  return (
    <section
      className="pastel-card flex items-center justify-between gap-4 border-l-4 border-l-orange-500 p-4"
      aria-label="Paused"
    >
      <div className="min-w-0 text-[15px] text-foreground">
        <p>
          <span className="font-semibold">Paused.</span>
          {/* Past its end a pause stops nothing, whatever its blocks still say. */}
          {!ended && <> Stopped: {what}.</>}
        </p>
        <p className="mt-1 text-[13px] text-foreground/70">
          {until
            ? (endedLine ?? `Lifts on its own ${formatDayTime(until, now)}, ${formatUntilDay(until, now)}.`)
            : "No end date: it stays until someone lifts it."}
        </p>
        {lift.error && (
          <p role="alert" className="mt-1 text-[13px] font-medium text-[var(--ink-red)]">
            {lift.error.message}
          </p>
        )}
      </div>
      {canLift && (
        <button
          type="button"
          onClick={() => lift.mutate()}
          disabled={lift.isPending}
          className="shrink-0 rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
        >
          {lift.isPending ? "Lifting..." : "Lift the pause now"}
        </button>
      )}
    </section>
  );
}
