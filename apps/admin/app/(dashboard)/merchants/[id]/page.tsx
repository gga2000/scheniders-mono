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
  UserCircle,
  Loader2,
} from "lucide-react";
import { ImpersonateButton } from "@/components/merchants/impersonate-button";
import { TenantTimeline } from "@/components/merchants/tenant-timeline";
import { OnboardingChecklist } from "@/components/merchants/onboarding-checklist";
import { TenantComparison } from "@/components/merchants/tenant-comparison";
import { OverviewTab } from "@/components/merchants/detail/overview-tab";
import { BillingTab } from "@/components/merchants/detail/billing-tab";
import { UsageTab } from "@/components/merchants/detail/usage-tab";
import { TeamTab } from "@/components/merchants/detail/team-tab";
import { NotesTab } from "@/components/merchants/detail/notes-tab";

const tabs = ["Overview", "Billing", "Usage", "Team", "Notes", "Timeline", "Onboarding"] as const;
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


export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useMerchantDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState("");
  const [showComparison, setShowComparison] = useState(false);

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
              <button
                onClick={() => setShowComparison(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-all"
              >
                Compare
              </button>
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
      {activeTab === "Timeline" && (
        <TenantTimeline
          transactions={transactions}
          notes={notes}
          orderCount={orderCount}
          tenant={tenant}
        />
      )}
      {activeTab === "Onboarding" && (
        <OnboardingChecklist
          tenant={tenant}
          orderCount={orderCount}
          teamCount={team.length}
          walletBalance={wallet?.balance_iqd ?? 0}
          hasStorefront={!!(tenant.store_config && Object.keys(tenant.store_config).length > 0)}
          hasCustomDomain={false}
        />
      )}

      <TenantComparison
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        currentTenant={{
          id: tenant.id,
          business_name: tenant.business_name,
          plan: tenant.plan,
          status: tenant.status,
          city: tenant.city,
          wallet_balance: wallet?.balance_iqd ?? 0,
          order_count: orderCount,
          team_size: team.length,
          created_at: tenant.created_at,
        }}
      />
    </div>
  );
}
