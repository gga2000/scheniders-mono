"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Activity,
  Shield,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  Wallet,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformHealth {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  ordersLast24h: number;
}

interface RiskIndicator {
  tenant_id: string;
  business_name: string;
  risk_score: number;
  reasons: string[];
  balance_iqd: number;
  plan: string;
}

interface LowBalanceWallet {
  tenant_id: string;
  business_name: string;
  balance_iqd: number;
  threshold_iqd: number;
}

interface TenantGrowth {
  thisMonth: number;
  lastMonth: number;
}

interface HealthData {
  platformHealth: PlatformHealth;
  riskIndicators: RiskIndicator[];
  lowBalanceWallets: LowBalanceWallet[];
  tenantGrowth: TenantGrowth;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function getRiskBarColor(score: number): string {
  if (score <= 3) return "bg-green-500";
  if (score <= 6) return "bg-amber-500";
  return "bg-red-500";
}

function getRiskBarBg(score: number): string {
  if (score <= 3) return "bg-green-100";
  if (score <= 6) return "bg-amber-100";
  return "bg-red-100";
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Failed to fetch health data");
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HealthPage() {
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ["admin", "health"],
    queryFn: fetchHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const health = data?.platformHealth;
  const riskIndicators = data?.riskIndicators ?? [];
  const lowBalanceWallets = data?.lowBalanceWallets ?? [];
  const growth = data?.tenantGrowth;

  const hasIssues =
    riskIndicators.length > 0 || lowBalanceWallets.length > 0;
  const issueCount = riskIndicators.length + lowBalanceWallets.length;

  const activePercent =
    health && health.totalTenants > 0
      ? Math.round((health.activeTenants / health.totalTenants) * 100)
      : 0;

  const growthDiff =
    growth ? growth.thisMonth - growth.lastMonth : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Platform Health
        </h1>
        <p className="text-foreground-muted mt-1">
          {isLoading
            ? "Loading..."
            : "Real-time monitoring and risk assessment"}
        </p>
      </div>

      {/* Platform Status Bar */}
      {!isLoading && (
        <div
          className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-sm font-semibold ${
            hasIssues
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-green-50 border border-green-200 text-green-800"
          }`}
        >
          {hasIssues ? (
            <>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {issueCount} issue{issueCount !== 1 ? "s" : ""} detected
              &mdash; {riskIndicators.length} at-risk tenant
              {riskIndicators.length !== 1 ? "s" : ""},&nbsp;
              {lowBalanceWallets.length} low balance wallet
              {lowBalanceWallets.length !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              All systems operational
            </>
          )}
        </div>
      )}

      {/* Health Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Tenants - Green */}
        <div className="pastel-card pastel-card-green p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <Shield className="h-5 w-5 text-green-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-green-900/70 uppercase tracking-wider">
            Active Tenants
          </h3>
          {isLoading ? (
            <div className="h-8 w-28 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <>
              <p className="text-2xl md:text-3xl font-bold text-green-950 tracking-tight mt-1">
                {health?.activeTenants ?? 0}
              </p>
              <p className="text-xs text-green-800/70 font-medium mt-0.5">
                {activePercent}% of {health?.totalTenants ?? 0} total
              </p>
            </>
          )}
        </div>

        {/* Orders (24h) - Blue */}
        <div className="pastel-card pastel-card-blue p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <ShoppingBag className="h-5 w-5 text-blue-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-blue-900/70 uppercase tracking-wider">
            Orders (24h)
          </h3>
          {isLoading ? (
            <div className="h-8 w-20 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-blue-950 tracking-tight mt-1">
              {health?.ordersLast24h ?? 0}
            </p>
          )}
        </div>

        {/* At Risk - Pink */}
        <div className="pastel-card pastel-card-pink p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <AlertTriangle className="h-5 w-5 text-rose-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-rose-900/70 uppercase tracking-wider">
            At Risk
          </h3>
          {isLoading ? (
            <div className="h-8 w-16 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-rose-950 tracking-tight mt-1">
              {riskIndicators.length}
            </p>
          )}
        </div>

        {/* Growth - Mint/Green */}
        <div className="pastel-card pastel-card-green p-4 relative overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <TrendingUp className="h-5 w-5 text-green-700" />
            </div>
          </div>
          <h3 className="text-xs font-semibold text-green-900/70 uppercase tracking-wider">
            Growth
          </h3>
          {isLoading ? (
            <div className="h-8 w-24 rounded-lg bg-white/40 animate-pulse mt-1" />
          ) : (
            <>
              <p className="text-2xl md:text-3xl font-bold text-green-950 tracking-tight mt-1 flex items-center gap-2">
                {growth?.thisMonth ?? 0}
                {growthDiff > 0 && (
                  <span className="flex items-center text-sm text-green-600 font-semibold">
                    <ArrowUp className="w-3.5 h-3.5" />
                    {growthDiff}
                  </span>
                )}
                {growthDiff < 0 && (
                  <span className="flex items-center text-sm text-red-600 font-semibold">
                    <ArrowDown className="w-3.5 h-3.5" />
                    {Math.abs(growthDiff)}
                  </span>
                )}
              </p>
              <p className="text-xs text-green-800/70 font-medium mt-0.5">
                this month vs {growth?.lastMonth ?? 0} last month
              </p>
            </>
          )}
        </div>
      </div>

      {/* Risk Alerts */}
      <div className="pastel-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-foreground/60" />
          <h2 className="text-sm font-semibold text-foreground">
            Tenants at Risk
          </h2>
          {!isLoading && (
            <span className="ml-auto text-xs text-foreground/40">
              {riskIndicators.length} tenant
              {riskIndicators.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
          </div>
        ) : riskIndicators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <CheckCircle2 className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No tenants at risk</p>
            <p className="text-xs mt-1">All merchants are operating normally</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {riskIndicators.map((ri) => (
              <div
                key={ri.tenant_id}
                className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3"
              >
                {/* Business info */}
                <div className="md:w-1/4 min-w-0">
                  <Link
                    href={`/merchants/${ri.tenant_id}`}
                    className="font-semibold text-foreground hover:underline truncate block"
                  >
                    {ri.business_name}
                  </Link>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-foreground/5 text-foreground/60 mt-1 inline-block">
                    {ri.plan}
                  </span>
                </div>

                {/* Risk score bar */}
                <div className="md:w-1/4 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex-1 h-2.5 rounded-full ${getRiskBarBg(
                        ri.risk_score
                      )} overflow-hidden`}
                    >
                      <div
                        className={`h-full rounded-full ${getRiskBarColor(
                          ri.risk_score
                        )} transition-all duration-500`}
                        style={{
                          width: `${Math.min(100, (ri.risk_score / 10) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-foreground/70 tabular-nums shrink-0">
                      {ri.risk_score}/10
                    </span>
                  </div>
                </div>

                {/* Reason pills */}
                <div className="md:flex-1 flex flex-wrap gap-1.5">
                  {ri.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"
                    >
                      {reason}
                    </span>
                  ))}
                </div>

                {/* Balance */}
                <div className="md:w-32 text-right">
                  <p className="text-sm font-medium text-foreground/70 tabular-nums">
                    {formatIQD(ri.balance_iqd)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low Balance Wallets */}
      <div className="pastel-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Wallet className="w-4 h-4 text-foreground/60" />
          <h2 className="text-sm font-semibold text-foreground">
            Low Balance Alerts
          </h2>
          {!isLoading && (
            <span className="ml-auto text-xs text-foreground/40">
              {lowBalanceWallets.length} wallet
              {lowBalanceWallets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
          </div>
        ) : lowBalanceWallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <CheckCircle2 className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">All wallets healthy</p>
            <p className="text-xs mt-1">
              No wallets below their threshold
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Business Name
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Threshold
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Deficit
                  </th>
                  <th className="p-3 text-center text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowBalanceWallets.map((w) => {
                  const deficit = w.threshold_iqd - w.balance_iqd;
                  return (
                    <tr
                      key={w.tenant_id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="p-3">
                        <Link
                          href={`/merchants/${w.tenant_id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {w.business_name}
                        </Link>
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {formatIQD(w.balance_iqd)}
                      </td>
                      <td className="p-3 text-right text-foreground/70 tabular-nums">
                        {formatIQD(w.threshold_iqd)}
                      </td>
                      <td className="p-3 text-right font-semibold text-red-600 tabular-nums">
                        -{formatIQD(deficit)}
                      </td>
                      <td className="p-3 text-center">
                        <Link
                          href="/billing"
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-xs font-semibold transition-all border border-[var(--card-border)]"
                        >
                          <Wallet className="w-3 h-3" />
                          Top Up
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
