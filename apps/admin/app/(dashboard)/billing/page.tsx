"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CreditCard,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from "lucide-react";
import { ExportButton } from "@/components/shared/export-button";

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

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TYPE_STYLES: Record<string, string> = {
  topup: "bg-green-100 text-green-800",
  charge: "bg-amber-100 text-amber-800",
  refund: "bg-blue-100 text-blue-800",
  adjustment: "bg-purple-100 text-purple-800",
};

const PRESET_AMOUNTS = [25_000, 50_000, 100_000, 250_000, 500_000];

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

async function fetchBilling(): Promise<BillingData> {
  const res = await fetch("/api/billing");
  if (!res.ok) throw new Error("Failed to fetch billing data");
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ["admin", "billing"],
    queryFn: fetchBilling,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Top-up form state
  const [topupTenantId, setTopupTenantId] = useState("");
  const [topupAmount, setTopupAmount] = useState<number | "">("");
  const [topupDescription, setTopupDescription] = useState("");

  const topupMutation = useMutation({
    mutationFn: async (payload: {
      tenant_id: string;
      amount: number;
      description?: string;
    }) => {
      const res = await fetch("/api/billing/topup", {
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
      setTopupTenantId("");
      setTopupAmount("");
      setTopupDescription("");
    },
  });

  function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    if (!topupTenantId || !topupAmount || topupAmount <= 0) return;
    topupMutation.mutate({
      tenant_id: topupTenantId,
      amount: topupAmount,
      description: topupDescription || undefined,
    });
  }

  const wallets = data?.wallets ?? [];
  const transactions = data?.recentTransactions ?? [];
  const summary = data?.summary;

  // Sort wallets by balance descending
  const sortedWallets = [...wallets].sort(
    (a, b) => b.balance_iqd - a.balance_iqd
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Billing & Wallets
          </h1>
          <p className="text-foreground-muted mt-1">
            Manage wallet balances, top-ups, and transaction history
          </p>
        </div>
        <ExportButton type="transactions" label="Export Transactions" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Balance - Green */}
        <div className="pastel-card pastel-card-green p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <Wallet className="h-5 w-5 text-green-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-green-900/70 uppercase tracking-wider">
            Total Balance
          </h3>
          {isLoading ? (
            <div className="h-8 w-28 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-green-950 tracking-tight mt-1">
              {formatIQD(summary?.totalBalance ?? 0)}
            </p>
          )}
        </div>

        {/* Total Charged - Amber */}
        <div className="pastel-card pastel-card-yellow p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <ArrowDownRight className="h-5 w-5 text-amber-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-amber-900/70 uppercase tracking-wider">
            Total Charged
          </h3>
          {isLoading ? (
            <div className="h-8 w-28 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-amber-950 tracking-tight mt-1">
              {formatIQD(summary?.totalCharged ?? 0)}
            </p>
          )}
        </div>

        {/* Total Topped Up - Blue */}
        <div className="pastel-card pastel-card-blue p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <TrendingUp className="h-5 w-5 text-blue-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-blue-900/70 uppercase tracking-wider">
            Total Topped Up
          </h3>
          {isLoading ? (
            <div className="h-8 w-28 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-blue-950 tracking-tight mt-1">
              {formatIQD(summary?.totalToppedUp ?? 0)}
            </p>
          )}
        </div>

        {/* Low Balance - Pink */}
        <div className="pastel-card pastel-card-pink p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <AlertTriangle className="h-5 w-5 text-rose-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-rose-900/70 uppercase tracking-wider">
            Low Balance
          </h3>
          {isLoading ? (
            <div className="h-8 w-16 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-rose-950 tracking-tight mt-1">
              {summary?.lowBalanceCount ?? 0}
            </p>
          )}
        </div>
      </div>

      {/* Top-up Form */}
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
            <label className="block text-xs font-medium text-foreground/60 mb-1">
              Merchant
            </label>
            <select
              value={topupTenantId}
              onChange={(e) => setTopupTenantId(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
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
            <label className="block text-xs font-medium text-foreground/60 mb-1">
              Amount (IQD)
            </label>
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTopupAmount(preset)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    topupAmount === preset
                      ? "bg-foreground text-background border-foreground"
                      : "bg-[var(--card-bg)] text-foreground/60 border-[var(--card-border)] hover:border-foreground/30"
                  }`}
                >
                  {(preset / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
            <input
              type="number"
              value={topupAmount}
              onChange={(e) =>
                setTopupAmount(e.target.value ? Number(e.target.value) : "")
              }
              placeholder="Custom amount"
              min={1}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* Description */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-foreground/60 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={topupDescription}
              onChange={(e) => setTopupDescription(e.target.value)}
              placeholder="Manual top-up"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={
              !topupTenantId ||
              !topupAmount ||
              topupAmount <= 0 ||
              topupMutation.isPending
            }
            className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center gap-2"
          >
            {topupMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
            Top Up
          </button>
        </form>

        {topupMutation.isError && (
          <p className="text-xs text-red-600 mt-2">
            {(topupMutation.error as Error).message}
          </p>
        )}
        {topupMutation.isSuccess && (
          <p className="text-xs text-green-600 mt-2">
            Top-up successful! New balance:{" "}
            {formatIQD(topupMutation.data?.newBalance ?? 0)}
          </p>
        )}
      </div>

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
              <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
            </div>
          ) : sortedWallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
              <Wallet className="w-10 h-10 mb-2" />
              <p className="text-sm">No wallets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)]">
                    <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                      Business
                    </th>
                    <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="p-3 text-center text-xs font-semibold text-foreground/60 uppercase tracking-wider">
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
                          isLow ? "bg-rose-50/50" : ""
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
                          <span className="text-xs font-semibold capitalize">
                            {w.plan}
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {formatIQD(w.balance_iqd)}
                        </td>
                        <td className="p-3 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                              Low
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">
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
              <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
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
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize shrink-0 ${
                      TYPE_STYLES[tx.type] ?? "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {tx.type}
                  </span>

                  {/* Amount + direction icon */}
                  <div className="flex items-center gap-1 min-w-0">
                    {tx.type === "topup" || tx.type === "refund" ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatIQD(Number(tx.amount_iqd) || 0)}
                    </span>
                  </div>

                  {/* Business name */}
                  <span className="text-xs text-foreground/60 truncate flex-1 min-w-0">
                    {tx.tenants?.business_name ?? "Unknown"}
                  </span>

                  {/* Time ago */}
                  <span className="text-[11px] text-foreground/40 shrink-0">
                    {timeAgo(tx.created_at)}
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
