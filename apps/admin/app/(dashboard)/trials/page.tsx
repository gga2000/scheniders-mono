"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Plus,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { keptRequestIds, requestKey, shopKey } from "@/lib/request-ids";
import { failureOf, sendJson } from "@/lib/send-json";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { okOrLoadFailure } from "@/lib/load-failure";
import { useCan } from "@/hooks/use-admin-auth";
import { TrialChecksPanel } from "@/components/trials/trial-checks-panel";
import { TrialFilterChips } from "@/components/trials/trial-filter-chips";
import { TrialFollowUpLine } from "@/components/trials/trial-follow-up-line";
import { useLiveTick } from "@/hooks/use-live-tick";
import {
  TRIAL_FOLLOW_UP_KEY,
  inTrialFilter,
  trialFilterCounts,
  trialBar,
  trialFollowUpResponseSchema,
  type TrialBarTone,
  type TrialFilter,
  type TrialFollowUpRow,
} from "@/lib/trial-pipeline";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatCount, formatDayTime, formatIQD } from "@/lib/format";
import { TRIAL_ENDING_DAYS } from "@/lib/baghdad-day";
import { adminFetch } from "@/lib/admin-fetch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Trial {
  id: string;
  business_name: string;
  slug: string;
  plan: string;
  status: string;
  trial_ends_at: string;
  city: string | null;
  contact_email: string | null;
  created_at: string;
  balance_iqd: number;
  days_remaining: number;
  is_expired: boolean;
  /** The shop's day on the Baghdad calendar, Day 0 on signup (lib/trial-shops). */
  trial_day: number;
  /** Paused while on trial: its days still run, and free days wait until the pause is lifted. */
  paused: boolean;
}

interface TrialsSummary {
  total: number;
  expiringSoon: number;
  expired: number;
  healthy: number;
}

interface TrialsResponse {
  trials: Trial[];
  summary: TrialsSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Where a trial stands, in Baghdad calendar days (see the trials route). */
function trialDayLabel({ is_expired, days_remaining: days }: Pick<Trial, "is_expired" | "days_remaining">): string {
  if (is_expired) {
    return days === 0 ? "Trial ended today" : `Trial ended ${-days} day${days === -1 ? "" : "s"} ago`;
  }
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `${days} days left`;
}

/** The header line: an ended trial that is not paid yet is no longer "on trial". */
function trialsLine({ total, expired }: TrialsSummary): string {
  const running = total - expired;
  const onTrial = `${running} ${running === 1 ? "shop" : "shops"} on trial`;
  return expired > 0 ? `${onTrial}, ${expired} ended and not paid yet` : onTrial;
}

/** The bar's fill, its track and the words under it, by how the trial stands (lib/trial-pipeline trialBar). */
const BAR_TONE: Record<TrialBarTone, { fill: string; track: string; ink: string }> = {
  running: { fill: "bg-green-500", track: "bg-green-500/15", ink: "text-[var(--ink-green)]" },
  ending: { fill: "bg-amber-500", track: "bg-amber-500/15", ink: "text-[var(--ink-amber)]" },
  last: { fill: "bg-red-500", track: "bg-red-500/15", ink: "text-[var(--ink-red)]" },
  ended: { fill: "bg-gray-400", track: "bg-gray-200", ink: "text-foreground/70" },
};

// ---------------------------------------------------------------------------
// Extend Button Component
// ---------------------------------------------------------------------------

function ExtendTrialButton({ tenantId }: { tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonOk = isStaffReason(reason);
  const queryClient = useQueryClient();
  // One id per ask, kept in this browser: a retry after a lost answer, a
  // reload, or the shop page's free trial days for the same shop and days
  // extends the trial once (round 21, structure new 7).
  const [requestIds] = useState(() => keptRequestIds("free-days"));

  const mutation = useMutation({
    mutationFn: async (days: number) => {
      const request_id = requestIds.idFor(requestKey(shopKey(tenantId), "trial", days));
      const answer = await sendJson("/api/trials/extend", { tenant_id: tenantId, days, reason: reason.trim(), request_id });
      if (!answer.ok) throw failureOf(answer.status, answer.data, "Failed to extend trial");
      return answer.data;
    },
    onSuccess: () => {
      requestIds.done();
      queryClient.invalidateQueries({ queryKey: ["admin", "trials"] });
      setIsOpen(false);
      setReason("");
    },
  });

  const presets = [
    { label: "+3 days", days: 3 },
    { label: "+7 days", days: 7 },
    { label: "+14 days", days: 14 },
    { label: "+30 days", days: 30 },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-xs font-semibold transition-all border border-[var(--card-border)]"
      >
        <Plus className="w-3.5 h-3.5" />
        Extend
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <StaffReasonInput
        value={reason}
        onChange={setReason}
        placeholder="Why? (saved in the log)"
        className="w-48"
      />
      {presets.map((p) => (
        <button
          key={p.days}
          onClick={() => mutation.mutate(p.days)}
          disabled={mutation.isPending || !reasonOk}
          className="px-2.5 py-1 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-xs font-semibold text-foreground/70 hover:text-foreground transition-all border border-[var(--card-border)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setIsOpen(false)}
        className="px-2 py-1 rounded-lg text-xs text-foreground/70 hover:text-foreground transition-colors"
      >
        Cancel
      </button>
      {mutation.isPending && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/70" />
      )}
      {mutation.isError && (
        <span className="text-xs text-[var(--ink-red)] font-medium">
          {mutation.error.message}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrialsPage() {
  const pageRead = useQuery<TrialsResponse>({
    queryKey: ["admin", "trials"],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/trials"), "the trials");
      return res.json();
    },
    staleTime: 30_000,
  });
  const { data, isLoading, isError, error, refetch, isFetching } = pageRead;
  // The follow-up facts have their own read: when it fails, the list stays (round 18).
  const followUp = useQuery({
    queryKey: TRIAL_FOLLOW_UP_KEY,
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/trials/follow-up"), "the follow-up facts");
      return trialFollowUpResponseSchema.parse(await res.json()).trials;
    },
    staleTime: 30_000,
  });
  const followUps = useMemo(
    () => new Map<string, TrialFollowUpRow>((followUp.data ?? []).map((row) => [row.id, row])),
    [followUp.data],
  );
  const [filter, setFilter] = useState<TrialFilter>("all");
  const now = useLiveTick(60_000);
  const can = useCan();
  // Only staff who may lift a pause are sent to the shop page to lift it.
  const canLift = can("reactivate_tenant");
  const canLogCall = can("handle_support");

  if (isError && !data) {
    return <LoadError what="the trials" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const trials = data?.trials ?? [];
  const summary = data?.summary ?? { total: 0, expiringSoon: 0, expired: 0, healthy: 0 };

  // Sort: expired first, then by days_remaining ascending (most urgent first)
  const sortedTrials = [...trials].sort((a, b) => {
    if (a.is_expired && !b.is_expired) return -1;
    if (!a.is_expired && b.is_expired) return 1;
    return a.days_remaining - b.days_remaining;
  });
  // The chips filter by the follow-up facts; until they are read, every shop shows.
  const shownFilter: TrialFilter = followUp.data ? filter : "all";
  const shownTrials = sortedTrials.filter((trial) => inTrialFilter(followUps.get(trial.id), shownFilter));

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Trials</h1>
        <p className="text-[13px] text-foreground/70">
          {isLoading ? "Loading..." : trialsLine(summary)}
        </p>
        <StaleLine read={pageRead} what="the trials" className="mt-2" />
      </div>

      {/* Stores that matched an earlier store (Fermi B5) */}
      <TrialChecksPanel />

      {/* Headline numbers, each naming its window (board v6: one surface). */}
      <NumberStrip columns={3} label="Trial numbers">
        <NumberCell label="Shops on trial, now" value={isLoading ? "..." : formatCount(summary.total - summary.expired)} />
        <NumberCell
          label={`Ending in ${TRIAL_ENDING_DAYS} days or less`}
          value={isLoading ? "..." : formatCount(summary.expiringSoon)}
          alert={summary.expiringSoon > 0}
        />
        <NumberCell
          label="Trial ended, not paid yet"
          value={isLoading ? "..." : formatCount(summary.expired)}
          note="Needs a call or a decision"
        />
      </NumberStrip>

      {/* Follow-up chips (B12 item 1): above the list, which stays as it was. */}
      {sortedTrials.length > 0 && followUp.data && (
        <TrialFilterChips
          value={shownFilter}
          counts={trialFilterCounts(sortedTrials.map((trial) => trial.id), followUps)}
          onChange={setFilter}
        />
      )}
      {followUp.isError && !followUp.data && (
        <LoadError compact what="the follow-up facts" error={followUp.error} onRetry={() => followUp.refetch()} retrying={followUp.isFetching} />
      )}
      <StaleLine read={followUp} what="the follow-up facts" />

      {/* Trial List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : sortedTrials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground/70">
          <Clock className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">No shops on trial</p>
          <p className="text-sm mt-1">No shop is on a trial, or past one and not paid yet.</p>
        </div>
      ) : shownTrials.length === 0 ? (
        <div className="pastel-card px-6 py-10 text-center text-sm text-foreground/70">No shop in this group right now.</div>
      ) : (
        <div className="pastel-card divide-y divide-[var(--card-border)]">
          {shownTrials.map((trial) => {
            const row = followUps.get(trial.id);
            const bar = trialBar(trial);
            const tone = BAR_TONE[bar.tone];
            return (
              <div key={trial.id}>
                <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                  {/* Left: Business info */}
                  <div className="md:w-1/4 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground/70 font-bold text-xs shrink-0">
                        {trial.business_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate name-dir" title={trial.business_name}>
                          {trial.business_name}
                        </p>
                        <p className="text-xs text-foreground/70 truncate" title={`${trial.slug}${trial.city ? ` \u00b7 ${trial.city}` : ""}`}>
                          {trial.slug}
                          {trial.city ? ` \u00b7 ${trial.city}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Center: Countdown bar */}
                  <div className="md:flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className={`h-2.5 rounded-full ${tone.track} overflow-hidden`}>
                          <div
                            className={`h-full rounded-full ${tone.fill} transition-all duration-500`}
                            style={{ width: `${bar.percent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className={`text-xs font-semibold ${tone.ink}`}>
                            {trialDayLabel(trial)}
                          </p>
                          <p className="text-xs text-foreground/70">
                            {formatDayTime(trial.trial_ends_at)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-foreground/20 hidden md:block shrink-0" />
                    </div>
                  </div>

                  {/* Right: Balance + Extend */}
                  <div className="md:w-1/4 flex items-center justify-between md:justify-end gap-3">
                    <span className="text-sm font-medium text-foreground/70">
                      {formatIQD(trial.balance_iqd)}
                    </span>
                    {trial.paused && canLift ? (
                      // The database gives trial days only to a shop on trial, not a paused one.
                      <Link
                        href={`/merchants/${trial.id}`}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground/70 hover:text-foreground border border-[var(--card-border)] transition-colors"
                      >
                        Paused: lift it to give days
                      </Link>
                    ) : trial.paused ? (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground/70 border border-[var(--card-border)]">
                        Paused: ask a super admin to lift it
                      </span>
                    ) : (
                      <ExtendTrialButton tenantId={trial.id} />
                    )}
                  </div>
                </div>
                {row && (
                  <div className="-mt-1 px-4 pb-4 md:px-5 md:pb-5">
                    <TrialFollowUpLine row={row} shopName={trial.business_name} canLogCall={canLogCall} now={now} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
