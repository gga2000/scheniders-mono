"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useAdminEmployeeDetail,
  useEmployeeActions,
} from "@/hooks/use-admin-employee-detail";
import { TeamActionFeed } from "@/components/team/team-action-feed";
import { TeamPerformanceChart } from "@/components/team/team-performance-chart";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  UserCircle,
  Loader2,
  Target,
  TrendingUp,
  Store,
  DollarSign,
  Trophy,
  Lock,
  CheckCircle2,
} from "lucide-react";
import {
  ACHIEVEMENTS,
  type CommissionStatus,
  type EmployeeCommission,
} from "@/types/leads";

const tabs = ["Actions", "Commissions", "Achievements", "Performance"] as const;
type Tab = (typeof tabs)[number];

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const commissionStatusStyles: Record<CommissionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
};

export default function TeamMemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAdminEmployeeDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>("Actions");
  const [actionPage, setActionPage] = useState(1);
  const { data: actionsData } = useEmployeeActions(id, actionPage);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Team
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
          <UserCircle className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">Employee not found</p>
        </div>
      </div>
    );
  }

  const { employee, recent_actions, commissions, achievements } = data;
  const initial = (employee.display_name ?? employee.email).charAt(0).toUpperCase();

  const roleStyles: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800",
    manager: "bg-blue-100 text-blue-800",
    agent: "bg-green-100 text-green-800",
  };

  const totalPages = actionsData ? Math.ceil(actionsData.total / 50) : 1;
  const paginatedActions = actionsData?.actions ?? recent_actions;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back link */}
      <Link
        href="/team"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Team
      </Link>

      {/* Header Card */}
      <div className="pastel-card p-5 md:p-6">
        <div className="flex items-center gap-4">
          {employee.avatar_url ? (
            <img
              src={employee.avatar_url}
              alt={employee.display_name ?? ""}
              className="w-14 h-14 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground truncate">
              {employee.display_name ?? "Unnamed"}
            </h1>
            <p className="text-sm text-foreground/50 truncate">{employee.email}</p>
          </div>
          <span
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize shrink-0",
              roleStyles[employee.role] ?? "bg-gray-100 text-gray-600"
            )}
          >
            {employee.role}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="pastel-card p-4 bg-blue-50/50">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs font-semibold">Leads Added</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(employee.leads_added)}
          </p>
        </div>
        <div className="pastel-card p-4 bg-green-50/50">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold">Leads Converted</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(employee.leads_converted)}
          </p>
        </div>
        <div className="pastel-card p-4 bg-purple-50/50">
          <div className="flex items-center gap-2 text-purple-700 mb-1">
            <Store className="w-4 h-4" />
            <span className="text-xs font-semibold">Stores Built</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(employee.stores_built)}
          </p>
        </div>
        <div className="pastel-card p-4 bg-amber-50/50">
          <div className="flex items-center gap-2 text-amber-700 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-semibold">Commission Earned</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(employee.commission_earned)}{" "}
            <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === tab
                ? "text-foreground border-b-2 border-[#1E1E1E]"
                : "text-foreground/50 hover:text-foreground/70"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Actions" && (
        <div className="space-y-4">
          <TeamActionFeed actions={paginatedActions} />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setActionPage((p) => Math.max(1, p - 1))}
                disabled={actionPage === 1}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/60 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <span className="text-xs text-foreground/50">
                Page {actionPage} of {totalPages}
              </span>
              <button
                onClick={() => setActionPage((p) => Math.min(totalPages, p + 1))}
                disabled={actionPage === totalPages}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/60 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "Commissions" && (
        <div className="pastel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/50">
                    Period
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/50">
                    Merchant
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                    Orders
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                    Revenue
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                    Earned
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-foreground/50">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-foreground/40 text-sm"
                    >
                      No commission records yet
                    </td>
                  </tr>
                ) : (
                  commissions.map((c: EmployeeCommission) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 text-foreground/70 whitespace-nowrap">
                        {new Date(c.period_start).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        -{" "}
                        {new Date(c.period_end).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {c.tenant?.business_name ??
                          c.lead?.merchant_name ??
                          "---"}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70">
                        {fmt(c.orders_count)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70">
                        {fmt(c.order_revenue)} IQD
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {fmt(c.amount_earned)} IQD
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize",
                            commissionStatusStyles[c.status]
                          )}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Achievements" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = achievements.includes(ach.key);
            return (
              <div
                key={ach.key}
                className={cn(
                  "pastel-card p-4 text-center transition-all",
                  unlocked
                    ? "ring-1"
                    : "opacity-40 grayscale"
                )}
                style={
                  unlocked
                    ? {
                        outlineColor: ach.color,
                        boxShadow: `0 0 12px ${ach.color}25`,
                      }
                    : undefined
                }
              >
                <div
                  className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center mb-2"
                  style={{
                    backgroundColor: unlocked
                      ? `${ach.color}20`
                      : "var(--card-bg)",
                  }}
                >
                  {unlocked ? (
                    <CheckCircle2
                      className="w-5 h-5"
                      style={{ color: ach.color }}
                    />
                  ) : (
                    <Lock className="w-5 h-5 text-foreground/30" />
                  )}
                </div>
                <p className="text-xs font-bold text-foreground">{ach.name}</p>
                <p className="text-[10px] text-foreground/50 mt-0.5">
                  {ach.description}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "Performance" && (
        <TeamPerformanceChart employeeId={id} actions={recent_actions} />
      )}
    </div>
  );
}
