"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquareText, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useSupportNeedsUs, useSupportStartConversation } from "@/hooks/use-support-cases";
import { LoadError } from "@/components/shared/load-error";
import {
  SHOP_PROBLEM_LABELS,
  SHOP_PROBLEM_OPENERS,
  formatAgo,
  leadProblem,
  problemDetail,
  type NeedsUsShop,
} from "@/lib/support";

const CARD = "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]";

interface SupportNeedsUsProps {
  /** Show a conversation in the inbox. */
  onOpenCase: (caseId: string) => void;
}

/**
 * Shops with something wrong right now, so the team writes before the
 * merchant has to. Each one opens with a first line staff can edit.
 */
export function SupportNeedsUs({ onOpenCase }: SupportNeedsUsProps) {
  const shops = useSupportNeedsUs();
  const now = useLiveTick(60_000);

  if (shops.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(CARD, "h-28 animate-pulse")} />
        ))}
      </div>
    );
  }

  if (shops.isError) {
    return (
      <LoadError
        what="the shops that need us"
        onRetry={() => shops.refetch()}
        retrying={shops.isFetching}
        error={shops.error}
      />
    );
  }

  const list = shops.data ?? [];
  if (list.length === 0) {
    return (
      <div className={cn(CARD, "flex flex-col items-center gap-2 px-6 py-16 text-center text-foreground/70")}>
        <CheckCircle2 className="h-8 w-8" />
        <p className="text-sm font-medium">Every shop looks fine right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        {list.length} shop{list.length === 1 ? "" : "s"} with something wrong. Write first, before they have to ask.
      </p>
      <ul className="space-y-3">
        {list.map((shop) => (
          <ShopRow key={shop.tenant_id} shop={shop} now={now} onOpenCase={onOpenCase} />
        ))}
      </ul>
    </div>
  );
}

function ShopRow({ shop, now, onOpenCase }: { shop: NeedsUsShop; now: number; onOpenCase: (caseId: string) => void }) {
  const start = useSupportStartConversation();
  const [draft, setDraft] = useState<string | null>(null);
  const openCase = shop.open_case;

  const send = () => {
    if (draft === null || draft.trim() === "" || start.isPending) return;
    start.mutate(
      { tenantId: shop.tenant_id, body: draft },
      {
        onSuccess: ({ caseId }) => {
          setDraft(null);
          toast.success(`Sent to ${shop.owner_name ?? shop.business_name}`);
          onOpenCase(caseId);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <li className={cn(CARD, "px-4 py-3.5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
            <span dir="auto">{shop.business_name}</span>
            {shop.display_id !== null && <span className="text-xs font-medium text-foreground/70">#{shop.display_id}</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-foreground-muted">
            <UserRound className="h-3 w-3" />
            {shop.owner_name ? <span dir="auto">{shop.owner_name}</span> : "No active member"}
            <span className="text-foreground/70">·</span>
            {shop.last_contact_at ? `We last wrote ${formatAgo(shop.last_contact_at, now)}` : "We never wrote to them"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openCase && (
            <button
              type="button"
              onClick={() => onOpenCase(openCase.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              {openCase.status === "waiting_us" ? "Waiting on us" : "Open conversation"}
            </button>
          )}
          {!openCase && draft === null && shop.owner_name !== null && (
            <button
              type="button"
              onClick={() => setDraft(SHOP_PROBLEM_OPENERS[leadProblem(shop.problems)])}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--primary-fg)]"
            >
              <Send className="h-3.5 w-3.5" />
              Write first
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {shop.problems.map((p) => {
          const detail = problemDetail(p.code, p.detail);
          return (
            <li
              key={p.code}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-[var(--ink-amber)]"
            >
              <AlertTriangle className="h-3 w-3" />
              {SHOP_PROBLEM_LABELS[p.code]}
              {detail && (
                <span dir="auto" className="max-w-[260px] truncate font-medium text-[var(--ink-amber)]">
                  · {detail}
                </span>
              )}
              {p.since && p.code !== "trial_ending" && (
                <span className="font-medium text-[var(--ink-amber)]">· {formatAgo(p.since, now)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {draft !== null && (
        <div className="mt-3 space-y-2">
          <textarea
            dir="auto"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={4000}
            aria-label={`First message to ${shop.business_name}`}
            className="w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-foreground/70">
              Goes to {shop.owner_name}&apos;s Help chat with a phone ping. Edit it first if you like.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={draft.trim() === "" || start.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--primary-fg)] transition-opacity disabled:opacity-40"
              >
                {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
