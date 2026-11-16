"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, ExternalLink, Loader2, MessageCircle, ShieldAlert, Undo2 } from "lucide-react";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { okOrLoadFailure } from "@/lib/load-failure";
import { toIntlIraqi } from "@/components/leads/lead-phone";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { LoadError } from "@/components/shared/load-error";
import {
  DECISION_LABEL,
  TRIAL_CHECKS_KEY,
  matchLine,
  storeName,
  type TrialCheck,
  type TrialCheckDecisionInput,
  type TrialChecksResponse,
} from "@/lib/trial-checks";
import { formatDayTime } from "@/lib/format";
import { createRequestIds } from "@/lib/request-ids";

const GIVE_BACK_DAYS = [3, 7];

/** Which button was pressed; the reason and the request id are added on send. */
type DecisionAsk = { decision: "allow_trial"; days: number } | { decision: "end_trial" } | { decision: "checked" };

/** Where the flagged store's trial stands now. */
function trialState(check: TrialCheck): string {
  const store = check.store;
  if (!store) return "Store deleted";
  if (store.status !== "trial") return `Now ${store.status}`;
  if (check.trial_withheld_at) return `Trial ended ${formatDayTime(check.trial_withheld_at)}`;
  if (store.trial_ends_at) return `Trial until ${formatDayTime(store.trial_ends_at)}`;
  return "On trial";
}

function DecideActions({ check }: { check: TrialCheck }) {
  const [reason, setReason] = useState("");
  const reasonOk = isStaffReason(reason);
  const queryClient = useQueryClient();
  const onTrial = check.store?.status === "trial";
  // One id per ask: a retry after a lost answer or a double click gives the days once.
  // The decision the row showed goes too: if someone decided it since, the server refuses.
  const [requestIds] = useState(createRequestIds);

  const mutation = useMutation({
    mutationFn: async (ask: DecisionAsk) => {
      const days = ask.decision === "allow_trial" ? ask.days : "";
      const input: TrialCheckDecisionInput = {
        ...ask,
        reason: reason.trim(),
        request_id: requestIds.idFor(`${check.tenant_id}:${ask.decision}:${days}:${reason.trim()}`),
        seen_decided_at: check.decided_at,
      };
      const res = await fetch(`/api/trial-checks/${check.tenant_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error || "Failed to save the decision");
      }
      return res.json();
    },
    onSuccess: () => {
      requestIds.done();
      queryClient.invalidateQueries({ queryKey: TRIAL_CHECKS_KEY });
      queryClient.invalidateQueries({ queryKey: ["admin", "trials"] });
      setReason("");
    },
    // A refusal may mean the row changed (decided meanwhile): show what is there now.
    onError: () => queryClient.invalidateQueries({ queryKey: TRIAL_CHECKS_KEY }),
  });

  const busy = mutation.isPending || !reasonOk;
  const button =
    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-xs font-semibold text-foreground/70 hover:text-foreground transition-all border border-[var(--card-border)] disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-1.5">
      <StaffReasonInput value={reason} onChange={setReason} placeholder="Why? (saved in the log)" />
      <div className="flex items-center gap-1.5 flex-wrap">
        {onTrial &&
          GIVE_BACK_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              disabled={busy}
              onClick={() => mutation.mutate({ decision: "allow_trial", days })}
              className={button}
            >
              <Undo2 className="w-3.5 h-3.5" />
              Give back {days} days
            </button>
          ))}
        {onTrial && !check.trial_withheld_at && (
          <button
            type="button"
            disabled={busy}
            onClick={() => mutation.mutate({ decision: "end_trial" })}
            className={button}
          >
            <Ban className="w-3.5 h-3.5" />
            End trial
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => mutation.mutate({ decision: "checked" })}
          className={button}
        >
          <Check className="w-3.5 h-3.5" />
          Checked
        </button>
        {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/70" />}
      </div>
      {mutation.isError && <p className="text-xs text-[var(--ink-red)] font-medium">{mutation.error.message}</p>}
    </div>
  );
}

function CheckRow({ check }: { check: TrialCheck }) {
  const phone = check.store?.contact_phone ? toIntlIraqi(check.store.contact_phone) : null;

  return (
    <div className="p-4 md:p-5 flex flex-col md:flex-row gap-4">
      <div className="md:w-1/4 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              check.verdict === "no_trial" ? "bg-rose-600/15 text-[var(--ink-red)]" : "bg-amber-600/15 text-[var(--ink-amber)]"
            }`}
          >
            {check.verdict === "no_trial" ? "No trial" : "Review"}
          </span>
          {check.needs_look && check.decided_at && (
            <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/70 text-xs font-bold uppercase tracking-wider">
              New match
            </span>
          )}
        </div>
        <p dir="auto" className="font-semibold text-foreground truncate">
          {storeName(check.store)}
        </p>
        <p className="text-xs text-foreground/70">{trialState(check)}</p>
        <div className="flex items-center gap-3">
          {check.store && (
            <Link
              href={`/merchants/${check.tenant_id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/70 hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" />
              Merchant page
            </Link>
          )}
          {phone && (
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/70 hover:text-foreground"
            >
              <MessageCircle className="w-3 h-3" />
              WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="md:flex-1 min-w-0 space-y-1">
        {check.matches.map((match) => (
          <p
            key={`${match.source}:${match.tenant_id}`}
            dir="auto"
            className="text-xs text-foreground/80"
          >
            {match.store ? (
              <Link href={`/merchants/${match.store.id}`} className="hover:underline">
                {matchLine(match)}
              </Link>
            ) : (
              matchLine(match)
            )}
          </p>
        ))}
        {check.staff_decision && check.decided_at && (
          <p className="text-xs text-foreground/70 pt-1">
            {DECISION_LABEL[check.staff_decision]}
            {check.decided_by_email ? ` by ${check.decided_by_email}` : ""}, {formatDayTime(check.decided_at)}
            {check.staff_reason ? `: ${check.staff_reason}` : ""}
          </p>
        )}
      </div>

      <div className="md:w-1/3">{check.store && <DecideActions check={check} />}</div>
    </div>
  );
}

/**
 * Stores that matched an earlier store that is not paying (Fermi B5, one free
 * trial per merchant). Open rows first; staff give the trial back, end it, or
 * mark it checked, each with a reason in the log. The merchant never sees why.
 */
export function TrialChecksPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<TrialChecksResponse>({
    queryKey: TRIAL_CHECKS_KEY,
    queryFn: async () => {
      const res = okOrLoadFailure(await fetch("/api/trial-checks"), "the trial checks");
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isError && !data) {
    return <LoadError what="the trial checks" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }
  if (isLoading || !data || data.checks.length === 0) return null;

  const { summary } = data;
  return (
    <section className="pastel-card">
      <div className="p-4 md:p-5 border-b border-[var(--card-border)]">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          One trial per merchant
        </h2>
        <p className="text-xs text-foreground-muted mt-1">
          {summary.needs_look === 0
            ? "Nothing new. Every flagged store has a decision."
            : `${summary.needs_look} to look at: ${summary.no_trial} no trial, ${summary.review} to review`}
        </p>
      </div>
      <div className="divide-y divide-[var(--card-border)]">
        {data.checks.map((check) => (
          <CheckRow key={check.tenant_id} check={check} />
        ))}
      </div>
    </section>
  );
}
