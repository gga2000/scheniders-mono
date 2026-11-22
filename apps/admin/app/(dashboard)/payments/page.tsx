"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertTriangle, Check, ExternalLink, FileText, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { adminFetch } from "@/lib/admin-fetch";
import { formatIQD } from "@/lib/format";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { LoadError } from "@/components/shared/load-error";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { okOrLoadFailure } from "@/lib/load-failure";
import { failureOf, sendJson } from "@/components/merchants/detail/action-ui";
import {
  REJECT_REASON_MAX,
  TOPUP_QUEUE_KEY,
  TOPUP_MAX_IQD,
  TOPUP_MIN_IQD,
  alreadyDecidedText,
  billingLine,
  lockedChip,
  topupQueueItemSchema,
  topupWarnings,
  type TopupDecision,
  type TopupQueueItem,
} from "@/lib/topup-queue";

const responseSchema = z.object({ requests: z.array(topupQueueItemSchema) });

const METHOD_LABEL: Record<TopupQueueItem["method"], string> = { zain_cash: "Zain Cash", qi_card: "Qi Card" };

function sentAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}


function Receipt({ row }: { row: TopupQueueItem }) {
  if (!row.receipt_url) {
    return <div className="flex h-36 w-28 items-center justify-center rounded-xl bg-foreground/5 text-xs text-foreground/70">No file</div>;
  }
  if (row.receipt_kind === "pdf") {
    return (
      <a
        href={row.receipt_url}
        target="_blank"
        rel="noreferrer"
        className="flex h-36 w-28 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-[var(--ink-blue)] hover:bg-blue-50"
      >
        <FileText className="w-6 h-6" />
        Open PDF
      </a>
    );
  }
  return (
    <a href={row.receipt_url} target="_blank" rel="noreferrer" className="group relative block h-36 w-28 shrink-0 overflow-hidden rounded-xl border border-[var(--card-border)]">
      {/* A short-lived signed link to a private file: shown as it is, never copied into the image cache. */}
      <Image
        src={row.receipt_url}
        alt={`Receipt from ${row.business_name ?? "the shop"}`}
        fill
        unoptimized
        sizes="112px"
        className="object-cover"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
        <ExternalLink className="w-3 h-3" />
        Full size
      </span>
    </a>
  );
}

/**
 * `canAddMore`: the login may top up wallets (super admins). Without it,
 * staff may credit up to the shop's own figure; the database refuses more.
 */
function Decision({ row, canDecide, canAddMore }: { row: TopupQueueItem; canDecide: boolean; canAddMore: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number>(row.amount_iqd);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "refuse" | null>(null);
  const decide = useMutation({
    mutationFn: async (decision: TopupDecision) => {
      // A dropped connection or a gateway's 502/504 says the decision may have
      // been saved, as every other money screen does: "Decision failed: 504"
      // invited a second press (round 22). A second press is safe: it answers 409.
      const answer = await sendJson(`/api/wallet-topup-requests/${row.id}`, decision);
      // 409: it was decided first and nothing changed; say so, and the
      // refreshed list shows how it was decided.
      if (answer.status === 409) return alreadyDecidedText(answer.data);
      if (!answer.ok) throw failureOf(answer.status, answer.data, "The decision was not saved.");
      return null;
    },
    onSuccess: (alreadyDecided) => {
      setConfirming(null);
      if (alreadyDecided) toast.info(alreadyDecided);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TOPUP_QUEUE_KEY });
    },
  });

  if (!canDecide) return <p className="text-xs text-foreground/70">Your login can see receipts but not decide them.</p>;

  const amountOk = Number.isInteger(amount) && amount >= TOPUP_MIN_IQD && amount <= TOPUP_MAX_IQD;
  // The rule line under the box counts letters; so does the button (round 21, UX new 7).
  const reasonOk = isStaffReason(reason) && reason.trim().length <= REJECT_REASON_MAX;
  const differs = amountOk && amount !== row.amount_iqd;
  const overAsked = amountOk && amount > row.amount_iqd && !canAddMore;

  if (confirming) {
    const approve = confirming === "approve";
    return (
      <div className="flex flex-col items-end gap-2 text-right" data-testid="payment-confirm">
        <p className="text-xs font-semibold text-foreground">
          {approve ? `Add ${formatIQD(amount)} to ${row.business_name ?? "this shop"}'s wallet?` : "Refuse this receipt?"}
        </p>
        {!approve && <p className="max-w-[16rem] text-xs text-foreground/70">The shop will read: “{reason.trim()}”</p>}
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-[var(--card-border)] px-2.5 py-1 text-xs">
            Back
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate(approve ? { approve: true, amount } : { approve: false, reason: reason.trim() })}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 ${approve ? "bg-green-600" : "bg-red-600"}`}
          >
            {decide.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {approve ? "Yes, add it" : "Yes, refuse"}
          </button>
        </div>
        {decide.isError && <p className="text-xs text-[var(--ink-red)]">{decide.error.message}</p>}
      </div>
    );
  }

  if (refusing) {
    return (
      <div className="flex w-64 flex-col gap-2">
        <StaffReasonInput value={reason} onChange={setReason} placeholder="Why? The shop will read this" />
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={() => setRefusing(false)} className="rounded-lg border border-[var(--card-border)] px-2.5 py-1 text-xs">
            Back
          </button>
          <button
            type="button"
            disabled={!reasonOk}
            onClick={() => setConfirming("refuse")}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            <X className="w-3 h-3" />
            Refuse
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-64 flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-foreground/70" htmlFor={`amount-${row.id}`}>
        Amount that arrived
      </label>
      <input
        id={`amount-${row.id}`}
        type="number"
        inputMode="numeric"
        min={TOPUP_MIN_IQD}
        max={TOPUP_MAX_IQD}
        step={1000}
        value={Number.isNaN(amount) ? "" : amount}
        onChange={(e) => setAmount(e.target.valueAsNumber)}
        className="w-full rounded-xl bg-white/80 px-3 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-foreground/10 outline-none focus:ring-foreground/30 dark:bg-white/10"
      />
      {overAsked ? (
        <p className="text-xs text-[var(--ink-red)]">The shop said {formatIQD(row.amount_iqd)}. More than that needs a super admin.</p>
      ) : (
        differs && <p className="text-xs text-[var(--ink-amber)]">The shop said {formatIQD(row.amount_iqd)}. The shop will see what you add.</p>
      )}
      {!amountOk && <p className="text-xs text-[var(--ink-red)]">Between 1,000 and 10,000,000 IQD.</p>}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setRefusing(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-red)] hover:bg-red-50"
        >
          <X className="w-3 h-3" />
          Refuse
        </button>
        <button
          type="button"
          disabled={!amountOk || overAsked}
          onClick={() => setConfirming("approve")}
          className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-40"
          data-testid="payment-approve"
        >
          <Check className="w-3 h-3" />
          {amountOk ? `Add ${formatIQD(amount)}` : "Add"}
        </button>
      </div>
    </div>
  );
}

function PaymentRow({ row, canDecide, canAddMore }: { row: TopupQueueItem; canDecide: boolean; canAddMore: boolean }) {
  const locked = lockedChip(row);
  const warnings = topupWarnings(row);
  return (
    <div className="pastel-card flex flex-wrap items-start gap-4 p-4" data-testid="payment-row">
      <Receipt row={row} />
      <div className="min-w-[16rem] flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link href={`/merchants/${row.tenant_id}`} dir="auto" className="text-sm font-semibold text-foreground hover:underline">
            {row.business_name ?? "Shop"}
          </Link>
          {row.display_id && <span className="text-xs text-foreground/70 tabular-nums">#{row.display_id}</span>}
        </div>
        <p className="text-sm text-foreground">
          <span className="font-bold tabular-nums">{formatIQD(row.amount_iqd)}</span>
          <span className="text-foreground/70"> by {METHOD_LABEL[row.method]} · sent {sentAgo(row.created_at)}</span>
        </p>
        <p className="text-xs text-foreground/70">{billingLine(row)}</p>
        {locked && (
          <p className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-[var(--ink-amber)]">
            <Lock className="w-3 h-3" />
            {locked}
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="flex items-center gap-1 text-xs font-medium text-[var(--ink-red)]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {w}
          </p>
        ))}
      </div>
      <Decision row={row} canDecide={canDecide} canAddMore={canAddMore} />
    </div>
  );
}

/**
 * «Payments to check» (Fermi B3): shops pay us by Qi or Zain Cash transfer
 * and upload the receipt. Staff check the money arrived, then add what came
 * in to the shop's wallet (a payment that covers the plan opens a locked shop
 * at once, a paused one once its pause lifts, unless its renewal is off: then
 * no money opens it, and its row says so), or refuse and say why; the shop
 * reads the reason and can send again.
 */
export default function PaymentsPage() {
  const { role } = useAdminAuth();
  const canDecide = role ? hasPermission(role, "check_payments") : false;
  const canAddMore = role ? hasPermission(role, "top_up_wallet") : false;
  const { data, dataUpdatedAt, error, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: TOPUP_QUEUE_KEY,
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/wallet-topup-requests"), "the payments");
      return responseSchema.parse(await res.json()).requests;
    },
    refetchInterval: 60_000,
  });

  if (isError && !data) {
    return <LoadError what="the payments" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Payments to check</h1>
        <p className="text-[13px] text-foreground/70 max-w-2xl">
          Shops paid us by transfer and sent the receipt. Check the money arrived, then add what came in. A payment that
          covers the plan opens a locked shop at once, or a paused one once its pause lifts, unless its renewal is off (its
          row says so). Refuse with a reason and the shop can send again.
        </p>
        {isError && (
          <LoadFailedLine
            what="the payments"
            shownFrom={dataUpdatedAt}
            kept="list"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
            className="mt-2"
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-foreground/70">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3" data-testid="payments-list">
          {data.map((row) => (
            <PaymentRow key={row.id} row={row} canDecide={canDecide} canAddMore={canAddMore} />
          ))}
        </div>
      ) : (
        <div className="pastel-card flex flex-col items-center gap-2 py-14 text-center" data-testid="payments-empty">
          <Check className="w-6 h-6 text-[var(--ink-green)]" />
          <p className="text-sm font-semibold text-foreground">No receipts waiting</p>
          <p className="text-xs text-foreground/70">New receipts show up here and in the bell.</p>
        </div>
      )}
    </div>
  );
}
