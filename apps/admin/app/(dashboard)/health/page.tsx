"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { LoadError } from "@/components/shared/load-error";
import { okOrLoadFailure } from "@/lib/load-failure";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatCount, formatIQD } from "@/lib/format";
import { shopFormHref } from "@/lib/shop-actions";
import { shopsAtRiskLine } from "@/lib/merchant-health";
import { useCan } from "@/hooks/use-admin-auth";
import { adminFetch } from "@/lib/admin-fetch";

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


function getRiskBarColor(score: number): string {
  if (score <= 3) return "bg-green-500";
  if (score <= 6) return "bg-amber-500";
  return "bg-red-500";
}

function getRiskBarBg(score: number): string {
  if (score <= 3) return "bg-green-500/15";
  if (score <= 6) return "bg-amber-500/15";
  return "bg-red-500/15";
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

async function fetchHealth(): Promise<HealthData> {
  const res = okOrLoadFailure(await adminFetch("/api/health"), "the health numbers");
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HealthPage() {
  const canTopUp = useCan()("top_up_wallet");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ["admin", "health"],
    queryFn: fetchHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isError && !data) {
    return <LoadError what="the health numbers" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const health = data?.platformHealth;
  const riskIndicators = data?.riskIndicators ?? [];
  const lowBalanceWallets = data?.lowBalanceWallets ?? [];
  const growth = data?.tenantGrowth;

  const hasIssues =
    riskIndicators.length > 0 || lowBalanceWallets.length > 0;

  const activePercent =
    health && health.totalTenants > 0
      ? Math.round((health.activeTenants / health.totalTenants) * 100)
      : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Shops at risk</h1>
      </div>

      {/* Platform Status Bar */}
      {!isLoading && (
        <div
          className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-sm font-semibold ${
            hasIssues
              ? "bg-amber-500/5 border border-amber-200 text-[var(--ink-amber)]"
              : "bg-green-500/5 border border-green-200 text-[var(--ink-green)]"
          }`}
        >
          {hasIssues ? (
            <>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {shopsAtRiskLine(riskIndicators, lowBalanceWallets)}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              All systems operational
            </>
          )}
        </div>
      )}

      {/* Headline numbers, each naming its window (board v6: one surface). */}
      <NumberStrip columns={4} label="Shop health numbers">
        <NumberCell
          label="Active shops, now"
          value={health ? formatCount(health.activeTenants) : "..."}
          note={health ? `${activePercent}% of ${formatCount(health.totalTenants)} shops` : undefined}
        />
        <NumberCell label="Orders, last 24 hours" value={health ? formatCount(health.ordersLast24h) : "..."} />
        <NumberCell
          label="Shops at risk, now"
          value={data ? formatCount(riskIndicators.length) : "..."}
          alert={riskIndicators.length > 0}
        />
        <NumberCell
          label="New shops, this month"
          value={growth ? formatCount(growth.thisMonth) : "..."}
          note={growth ? `${formatCount(growth.lastMonth)} last month` : undefined}
        />
      </NumberStrip>

      {/* Risk Alerts */}
      <div className="pastel-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-foreground/70" />
          <h2 className="text-sm font-semibold text-foreground">
            Shops at risk
          </h2>
          {!isLoading && (
            <span className="ml-auto text-xs text-foreground/70">
              {riskIndicators.length} {riskIndicators.length === 1 ? "shop" : "shops"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-foreground/70" />
          </div>
        ) : riskIndicators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
            <CheckCircle2 className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No shops at risk</p>
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
                    className="font-semibold text-foreground hover:underline truncate name-dir block"
                   title={ri.business_name}>
                    {ri.business_name}
                  </Link>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize bg-foreground/5 text-foreground/70 mt-1 inline-block">
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
                      className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-[var(--ink-red)]"
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
          <Wallet className="w-4 h-4 text-foreground/70" />
          <h2 className="text-sm font-semibold text-foreground">
            Low Balance Alerts
          </h2>
          {!isLoading && (
            <span className="ml-auto text-xs text-foreground/70">
              {lowBalanceWallets.length} wallet
              {lowBalanceWallets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-foreground/70" />
          </div>
        ) : lowBalanceWallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
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
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Business Name
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Threshold
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Deficit
                  </th>
                  <th className="p-3 text-center text-xs font-semibold text-foreground/70 uppercase tracking-wider">
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
                      <td className="p-3 text-right font-semibold text-[var(--ink-red)] tabular-nums">
                        -{formatIQD(deficit)}
                      </td>
                      <td className="p-3 text-center">
                        {/* The shop page's Add money form exists only for a login that may top up. */}
                        {canTopUp && (
                          <Link
                            href={shopFormHref(w.tenant_id, "money")}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-xs font-semibold transition-all border border-[var(--card-border)]"
                          >
                            <Wallet className="w-3 h-3" />
                            Top Up
                          </Link>
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
    </div>
  );
}
