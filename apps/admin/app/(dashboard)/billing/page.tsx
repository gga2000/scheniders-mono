"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from "lucide-react";
import { ExportButton } from "@/components/shared/export-button";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { LoadError } from "@/components/shared/load-error";
import { okOrLoadFailure } from "@/lib/load-failure";
import { createRequestIds } from "@/lib/request-ids";
import { STAFF_REASON_MAX } from "@/lib/billing-lock-tools";
import { quickTopUpPlan } from "@/lib/quick-top-up";
import { formatCount, formatIQD, formatWhen } from "@/lib/format";
import { useAdminAuth, useCan } from "@/hooks/use-admin-auth";
import { adminFetch } from "@/lib/admin-fetch";
import { planLabel } from "@/types/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalletRow {
  tenant_id: string;
  business_name: string;
  plan: string;
  status: string;
  balance_iqd: number;
  threshold_iqd: number;
  total_charged_iqd: number;
  total_topped_up_iqd: number;
}

interface Transaction {
  id: string;
  tenant_id: string;
  type: string;
  amount_iqd: number;
  balance_after_iqd: number;
  description: string | null;
  created_at: string;
  tenants: { business_name: string } | null;
}

interface BillingData {
  wallets: WalletRow[];
  recentTransactions: Transaction[];
  summary: {
    totalBalance: number;
    totalCharged: number;
    totalToppedUp: number;
    lowBalanceCount: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<string, string> = {
  topup: "bg-green-500/15 text-[var(--ink-green)]",
  charge: "bg-amber-500/15 text-[var(--ink-amber)]",
  refund: "bg-blue-500/15 text-[var(--ink-blue)]",
  adjustment: "bg-purple-500/15 text-[var(--ink-violet)]",
};

const PRESET_AMOUNTS = [25_000, 50_000, 100_000, 250_000, 500_000];

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

async function fetchBilling(): Promise<BillingData> {
  const res = okOrLoadFailure(await adminFetch("/api/billing"), "the wallets");
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const queryClient = useQueryClient();
  const can = useCan();
  const { isLoading: roleLoading } = useAdminAuth();
  // Adding money needs top_up_wallet. The form is drawn while the role loads,
  // so the tables below hold still for the super admins who use it; support
  // staff, who would only get a refusal, see it leave.
  const showTopUp = roleLoading || can("top_up_wallet");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<BillingData>({
    queryKey: ["admin", "billing"],
    queryFn: fetchBilling,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Top-up form state
  const [topupTenantId, setTopupTenantId] = useState("");
  const [topupAmount, setTopupAmount] = useState<number | "">("");
  const [topupDescription, setTopupDescription] = useState("");
  const [requestIds] = useState(createRequestIds);

  const topupMutation = useMutation({
    mutationFn: async (payload: {
      tenant_id: string;
      amount: number;
      description: string;
      request_id: string;
    }) => {
      const res = await adminFetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Top-up failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "billing"] });
      requestIds.done();
      setTopupTenantId("");
      setTopupAmount("");
      setTopupDescription("");
    },
  });

  // The lines under the form answer the last press. A change to the form
  // clears them, so a refusal or a success is never read as being about the
  // next shop; the form is held while a top-up runs (round 17).
  function changeTopup(apply: () => void) {
    topupMutation.reset();
    apply();
  }

  function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    const description = topupDescription.trim();
    if (topupPlan.kind !== "ready") return;
    topupMutation.mutate({
      tenant_id: topupTenantId,
      amount: topupPlan.amount,
      description,
      // Same shop and amount asked again (a retry, the reason reworded) reuses the id.
      request_id: requestIds.idFor(`${topupTenantId}:${topupPlan.amount}`),
    });
  }

  if (isError && !data) {
    return <LoadError what="the wallets" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const wallets = data?.wallets ?? [];
  const transactions = data?.recentTransactions ?? [];
  const summary = data?.summary;

  // Sort wallets by balance descending
  const sortedWallets = [...wallets].sort(
    (a, b) => b.balance_iqd - a.balance_iqd
  );
  // Named before the press: which shop, how much, its wallet now (audit W-03).
  const topupShop = wallets.find((w) => w.tenant_id === topupTenantId);
  const topupPlan = quickTopUpPlan(topupShop, topupAmount, topupDescription);
  const toppedUpShop = wallets.find((w) => w.tenant_id === topupMutation.variables?.tenant_id);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Wallets</h1>
          <p className="text-[13px] text-foreground/70">
            Every shop&apos;s wallet, its top-ups and its charges.
          </p>
        </div>
        {/* The transactions file needs adjust_balance (api/export). */}
        {can("adjust_balance") && <ExportButton type="transactions" label="Export Transactions" />}
      </div>

      {/* Headline numbers, each naming its window (board v6: one surface). */}
      <NumberStrip columns={4} label="Wallet numbers">
        <NumberCell label="In wallets, now" value={summary ? formatIQD(summary.totalBalance) : "..."} />
        <NumberCell label="Charged, all time" value={summary ? formatIQD(summary.totalCharged) : "..."} />
        <NumberCell label="Added, all time" value={summary ? formatIQD(summary.totalToppedUp) : "..."} />
        <NumberCell
          label="Wallets under their alert amount, now"
          value={summary ? formatCount(summary.lowBalanceCount) : "..."}
          alert={(summary?.lowBalanceCount ?? 0) > 0}
        />
      </NumberStrip>

      {/* Top-up Form */}
      {showTopUp && (
        <div className="pastel-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Quick Top-Up
          </h2>
          <form
            onSubmit={handleTopup}
            className="flex flex-col sm:flex-row gap-3 items-end"
          >
            {/* Merchant Select */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Merchant
              </label>
              <select
                value={topupTenantId}
                onChange={(e) => changeTopup(() => setTopupTenantId(e.target.value))}
                disabled={topupMutation.isPending}
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
              >
                <option value="">Select merchant...</option>
                {sortedWallets.map((w) => (
                  <option key={w.tenant_id} value={w.tenant_id}>
                    {w.business_name} ({formatIQD(w.balance_iqd)})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Amount (IQD)
              </label>
              <div className="flex gap-1.5 flex-wrap mb-1.5">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => changeTopup(() => setTopupAmount(preset))}
                    disabled={topupMutation.isPending}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-60 ${
                      topupAmount === preset
                        ? "bg-foreground text-background border-foreground"
                        : "bg-[var(--card-bg)] text-foreground/70 border-[var(--card-border)] hover:border-foreground/30"
                    }`}
                  >
                    {formatCount(preset)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={topupAmount}
                onChange={(e) =>
                  changeTopup(() => setTopupAmount(e.target.value ? Number(e.target.value) : ""))
                }
                disabled={topupMutation.isPending}
                placeholder="Custom amount"
                min={1}
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
              />
            </div>

            {/* Reason: on the wallet line and in the staff log */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Reason (saved in the log)
              </label>
              <input
                type="text"
                value={topupDescription}
                onChange={(e) => changeTopup(() => setTopupDescription(e.target.value))}
                disabled={topupMutation.isPending}
                placeholder="e.g. Qi transfer, receipt 12"
                maxLength={STAFF_REASON_MAX}
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={topupPlan.kind !== "ready" || topupMutation.isPending}
              className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center gap-2"
            >
              {topupMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpRight className="w-4 h-4" />
              )}
              {topupPlan.kind === "ready" ? topupPlan.button : "Top Up"}
            </button>
          </form>

          {topupPlan.kind === "ready" && (
            <p className="text-xs text-foreground/75 mt-3">{topupPlan.sentence}</p>
          )}
          {topupPlan.kind === "blocked" && (
            <p className="text-xs text-[var(--ink-red)] mt-3">{topupPlan.words}</p>
          )}

          {topupMutation.isError && (
            <p className="text-xs text-[var(--ink-red)] mt-2">
              {(topupMutation.error as Error).message}
            </p>
          )}
          {topupMutation.isSuccess && (
            <p className="text-xs text-[var(--ink-green)] mt-2">
              Added {formatIQD(topupMutation.variables?.amount ?? 0)}
              {toppedUpShop ? ` to ${toppedUpShop.business_name}` : ""}. Wallet now{" "}
              {formatIQD(topupMutation.data?.newBalance ?? 0)}.
            </p>
          )}
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Left: Wallet Balances Table */}
        <div className="pastel-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--card-border)]">
            <h2 className="text-sm font-semibold text-foreground">
              Wallet Balances
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-foreground/70" />
            </div>
          ) : sortedWallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
              <Wallet className="w-10 h-10 mb-2" />
              <p className="text-sm">No wallets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)]">
                    <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      Business
                    </th>
                    <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="p-3 text-center text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWallets.map((w) => {
                    const isLow = w.balance_iqd < w.threshold_iqd;
                    return (
                      <tr
                        key={w.tenant_id}
                        className={`border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors ${
                          isLow ? "bg-rose-500/5" : ""
                        }`}
                      >
                        <td className="p-3">
                          <Link
                            href={`/merchants/${w.tenant_id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {w.business_name}
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="text-xs font-semibold">
                            {planLabel(w.plan)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {formatIQD(w.balance_iqd)}
                        </td>
                        <td className="p-3 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-[var(--ink-red)]">
                              Low
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-[var(--ink-green)]">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Recent Transactions */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Recent Transactions
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-foreground/70" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
              <CreditCard className="w-10 h-10 mb-2" />
              <p className="text-sm">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 py-2 border-b border-[var(--card-border)] last:border-0"
                >
                  {/* Type badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize shrink-0 ${
                      TYPE_STYLES[tx.type] ?? "bg-gray-500/15 text-foreground"
                    }`}
                  >
                    {tx.type}
                  </span>

                  {/* Amount + direction icon */}
                  <div className="flex items-center gap-1 min-w-0">
                    {tx.type === "topup" || tx.type === "refund" ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--ink-green)] shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-[var(--ink-amber)] shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatIQD(Number(tx.amount_iqd) || 0)}
                    </span>
                  </div>

                  {/* Business name */}
                  <span className="text-xs text-foreground/70 truncate name-dir flex-1 min-w-0" title={tx.tenants?.business_name ?? "Unknown"}>
                    {tx.tenants?.business_name ?? "Unknown"}
                  </span>

                  {/* Time ago */}
                  <span className="text-xs text-foreground/70 shrink-0">
                    {formatWhen(tx.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
