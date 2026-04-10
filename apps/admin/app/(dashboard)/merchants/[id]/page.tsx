"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMerchantDetail } from "@/hooks/use-merchant-detail";
import {
  ArrowLeft,
  Wallet,
  CreditCard,
  ShoppingBag,
  Users,
  Pin,
  Plus,
  CircleDollarSign,
  BarChart3,
  UserCircle,
  StickyNote,
  Loader2,
} from "lucide-react";
import { ImpersonateButton } from "@/components/merchants/impersonate-button";

const tabs = ["Overview", "Billing", "Usage", "Team", "Notes"] as const;
type Tab = (typeof tabs)[number];

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trial: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const planStyles: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-800",
  growth: "bg-purple-100 text-purple-800",
  enterprise: "bg-amber-100 text-amber-800",
};

const txTypeBadge: Record<string, string> = {
  topup: "bg-green-100 text-green-800",
  charge: "bg-amber-100 text-amber-800",
  refund: "bg-blue-100 text-blue-800",
  adjustment: "bg-purple-100 text-purple-800",
};

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useMerchantDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState("");

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
          href="/merchants"
          className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Merchants
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
          <UserCircle className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">Merchant not found</p>
        </div>
      </div>
    );
  }

  const { tenant, wallet, subscription, transactions, usage, team, notes, orderCount } = data;
  const primaryColor = tenant.branding?.primary_color || "#1E1E1E";

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back button */}
      <Link
        href="/merchants"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Merchants
      </Link>

      {/* Tenant Header Card */}
      <div className="pastel-card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {tenant.business_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{tenant.business_name}</h1>
              <p className="text-sm text-foreground/50">{tenant.slug}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
                statusStyles[tenant.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {tenant.status}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
                planStyles[tenant.plan] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {tenant.plan}
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <button className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all">
                Top Up
              </button>
              <button className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all">
                Change Plan
              </button>
              {tenant.status === "suspended" ? (
                <button className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all">
                  Reactivate
                </button>
              ) : (
                <button className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-all">
                  Suspend
                </button>
              )}
              <ImpersonateButton
                tenantId={tenant.id}
                businessName={tenant.business_name}
                slug={tenant.slug}
                status={tenant.status}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="pastel-card p-4 bg-green-50/50">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-semibold">Wallet Balance</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(wallet?.balance_iqd ?? 0)} <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-4 bg-amber-50/50">
          <div className="flex items-center gap-2 text-amber-700 mb-1">
            <CreditCard className="w-4 h-4" />
            <span className="text-xs font-semibold">Total Charged</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(wallet?.total_charged_iqd ?? 0)} <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-4 bg-blue-50/50">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <ShoppingBag className="w-4 h-4" />
            <span className="text-xs font-semibold">Total Orders</span>
          </div>
          <p className="text-lg font-bold text-foreground">{fmt(orderCount)}</p>
        </div>
        <div className="pastel-card p-4 bg-purple-50/50">
          <div className="flex items-center gap-2 text-purple-700 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold">Team Members</span>
          </div>
          <p className="text-lg font-bold text-foreground">{team.length}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--card-border)] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "text-foreground border-b-2 border-[#1E1E1E]"
                : "text-foreground/50 hover:text-foreground/70"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <OverviewTab tenant={tenant} subscription={subscription} />
      )}
      {activeTab === "Billing" && (
        <BillingTab wallet={wallet} transactions={transactions} />
      )}
      {activeTab === "Usage" && <UsageTab usage={usage} />}
      {activeTab === "Team" && <TeamTab team={team} />}
      {activeTab === "Notes" && (
        <NotesTab notes={notes} noteText={noteText} setNoteText={setNoteText} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview Tab                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  tenant,
  subscription,
}: {
  tenant: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["tenant"];
  subscription: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["subscription"];
}) {
  const infoRows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Contact Email", value: tenant.contact_email },
    { label: "Contact Phone", value: tenant.contact_phone },
    { label: "Address", value: tenant.address },
    { label: "City", value: tenant.city },
    { label: "Created", value: tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : null },
    { label: "Trial Ends", value: tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : null },
    {
      label: "Subscription Status",
      value: subscription ? `${subscription.status} (${subscription.plan})` : null,
    },
    {
      label: "Current Period",
      value: subscription
        ? `${new Date(subscription.current_period_start).toLocaleDateString()} - ${new Date(subscription.current_period_end).toLocaleDateString()}`
        : null,
    },
  ];

  return (
    <div className="pastel-card p-5 md:p-6">
      <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4">
        Tenant Information
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {infoRows.map((row) => (
          <div key={row.label} className="flex flex-col py-1.5">
            <span className="text-xs text-foreground/50 font-medium">{row.label}</span>
            <span className="text-sm font-semibold text-foreground mt-0.5">
              {row.value || "\u2014"}
            </span>
          </div>
        ))}
      </div>

      {tenant.settings && Object.keys(tenant.settings).length > 0 && (
        <div className="mt-6 pt-4 border-t border-[var(--card-border)]">
          <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">
            Settings
          </h3>
          <pre className="text-xs text-foreground/70 bg-foreground/[0.03] rounded-xl p-3 overflow-x-auto">
            {JSON.stringify(tenant.settings, null, 2)}
          </pre>
        </div>
      )}

      {tenant.store_config && Object.keys(tenant.store_config).length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
          <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">
            Store Config
          </h3>
          <pre className="text-xs text-foreground/70 bg-foreground/[0.03] rounded-xl p-3 overflow-x-auto">
            {JSON.stringify(tenant.store_config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Billing Tab                                                        */
/* ------------------------------------------------------------------ */

function BillingTab({
  wallet,
  transactions,
}: {
  wallet: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["wallet"];
  transactions: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["transactions"];
}) {
  return (
    <div className="space-y-5">
      {/* Wallet Summary */}
      {wallet && (
        <div className="pastel-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4" />
            Wallet Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-foreground/50">Balance</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.balance_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Threshold</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.threshold_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Total Charged</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.total_charged_iqd)} IQD</p>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Total Topped Up</span>
              <p className="text-base font-bold text-foreground">{fmt(wallet.total_topped_up_iqd)} IQD</p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="pastel-card overflow-hidden">
        <div className="p-5 md:p-6 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Transaction History
          </h2>
        </div>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <CreditCard className="w-8 h-8 mb-2" />
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Balance After
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="p-3 text-foreground/70">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          txTypeBadge[tx.type] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{fmt(tx.amount_iqd)} IQD</td>
                    <td className="p-3 text-right text-foreground/70">{fmt(tx.balance_after_iqd)} IQD</td>
                    <td className="p-3 text-foreground/70">{tx.description || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Usage Tab                                                          */
/* ------------------------------------------------------------------ */

function UsageTab({
  usage,
}: {
  usage: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["usage"];
}) {
  return (
    <div className="pastel-card overflow-hidden">
      <div className="p-5 md:p-6 border-b border-[var(--card-border)]">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Monthly Usage
        </h2>
      </div>
      {usage.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
          <BarChart3 className="w-8 h-8 mb-2" />
          <p className="text-sm">No usage data yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Period
                </th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Orders
                </th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Orders Charged
                </th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Team Members
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr
                  key={`${u.year}-${u.month}`}
                  className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                >
                  <td className="p-3 font-medium">
                    {new Date(u.year, u.month - 1).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                    })}
                  </td>
                  <td className="p-3 text-right">{fmt(u.orders_count)}</td>
                  <td className="p-3 text-right">{fmt(u.orders_charged)}</td>
                  <td className="p-3 text-right">{u.team_members_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team Tab                                                           */
/* ------------------------------------------------------------------ */

function TeamTab({
  team,
}: {
  team: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["team"];
}) {
  const roleBadge: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800",
    admin: "bg-purple-100 text-purple-800",
    manager: "bg-blue-100 text-blue-800",
    staff: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="pastel-card p-5 md:p-6">
      <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Team Members ({team.length})
      </h2>
      {team.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
          <Users className="w-8 h-8 mb-2" />
          <p className="text-sm">No team members</p>
        </div>
      ) : (
        <div>
          {team.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 py-3 border-b border-[var(--card-border)] last:border-0"
            >
              {member.user_profiles?.avatar_url ? (
                <img
                  src={member.user_profiles.avatar_url}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                  <UserCircle className="w-5 h-5 text-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {member.user_profiles?.full_name || "Unnamed"}
                </p>
                <p className="text-xs text-foreground/50 truncate">
                  {member.user_profiles?.email || "\u2014"}
                  {member.user_profiles?.phone && ` \u00b7 ${member.user_profiles.phone}`}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize shrink-0 ${
                  roleBadge[member.role] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {member.role}
              </span>
              <span className="text-xs text-foreground/40 shrink-0">
                {new Date(member.joined_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notes Tab                                                          */
/* ------------------------------------------------------------------ */

function NotesTab({
  notes,
  noteText,
  setNoteText,
}: {
  notes: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>["notes"];
  noteText: string;
  setNoteText: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Add Note Form */}
      <div className="pastel-card p-5 md:p-6">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Note
        </h2>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write an admin note..."
          rows={3}
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/10 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            disabled={!noteText.trim()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Add Note
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="pastel-card p-5 md:p-6">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
          <StickyNote className="w-4 h-4" />
          Notes ({notes.length})
        </h2>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <StickyNote className="w-8 h-8 mb-2" />
            <p className="text-sm">No notes yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3 rounded-xl bg-foreground/[0.02] border border-[var(--card-border)]"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground/40">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    {note.is_pinned && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                        <Pin className="w-3 h-3" />
                        Pinned
                      </span>
                    )}
                  </div>
                  {note.updated_at !== note.created_at && (
                    <span className="text-[10px] text-foreground/30">
                      edited {new Date(note.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
