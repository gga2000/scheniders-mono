"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMerchantCode } from "@scheniders/shared";
import { useMerchantDetail } from "@/hooks/use-merchant-detail";
import { ArrowLeft, ExternalLink, UserCircle, Loader2 } from "lucide-react";
import { storeAddress } from "@scheniders/shared/store-address";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { SupportViewButton } from "@/components/support/support-view-button";
import { OnboardingChecklist } from "@/components/merchants/onboarding-checklist";
import { OverviewTab } from "@/components/merchants/detail/overview-tab";
import { UsageTab } from "@/components/merchants/detail/usage-tab";
import { TeamTab } from "@/components/merchants/detail/team-tab";
import { TimelineTab } from "@/components/merchants/detail/timeline-tab";
import { ShopActions } from "@/components/merchants/detail/shop-actions";
import { LimitedBanner } from "@/components/merchants/detail/limited-banner";
import { PinnedNoteStrip } from "@/components/merchants/detail/pinned-note-strip";
import { RecentOrdersSection } from "@/components/merchants/detail/recent-orders-section";
import { formatCount, formatIQD } from "@/lib/format";
import { shopStatusLine } from "@/lib/shop-status";
import { ShopStatus } from "@/components/merchants/detail/shop-status";
import { isSubscriptionRunning } from "@/lib/shop-actions";
import { PLAN_LABELS, PLAN_TIERS, type TenantRestrictions } from "@/types/admin";
import { CopyableText } from "@/components/shared/copyable-text";
import { LoadError } from "@/components/shared/load-error";
import { loadFailureKind } from "@/lib/load-failure";
import { usePageHeader } from "@/store/use-page-header";

/** "Starter plan", or "Growth plan" from the plan's own word for a plan this console does not sell. */
function planLabel(plan: string): string {
  const tier = PLAN_TIERS.find((t) => t === plan);
  if (tier) return tier === "internal" ? PLAN_LABELS.internal : `${PLAN_LABELS[tier]} plan`;
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

const tabs = ["Overview", "Timeline", "Usage", "Team", "Onboarding"] as const;
type Tab = (typeof tabs)[number];

/** Billing, Notes and Audit became the one Timeline (board m5); old links still land there. */
const FOLDED_INTO_TIMELINE = new Set(["Billing", "Notes", "Audit"]);

function tabFrom(value: string | null): Tab {
  if (value && (tabs as readonly string[]).includes(value)) return value as Tab;
  return value && FOLDED_INTO_TIMELINE.has(value) ? "Timeline" : "Overview";
}


export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error, refetch, isFetching } = useMerchantDetail(id);
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFrom(searchParams.get("tab")));
  // "Add a note" opens the Timeline with the note box ready to type in.
  const [focusNote, setFocusNote] = useState(false);
  // "View as merchant" opens the merchant's own app; the server only allows it with handle_support.
  const { role } = useAdminAuth();
  const canViewAsMerchant = role ? hasPermission(role, "handle_support") : false;

  // The browser tab names the shop, so ten open shops can be told apart.
  const setTab = usePageHeader((s) => s.setTab);
  const shopName = data?.tenant.business_name ?? null;
  useEffect(() => {
    setTab(shopName);
    return () => setTab(null);
  }, [shopName, setTab]);

  // Keep URL in sync with active tab so deep links and reloads remember the position.
  useEffect(() => {
    const current = searchParams.get("tab");
    if (activeTab === "Overview" && current === null) return;
    if (current === activeTab) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (activeTab === "Overview") params.delete("tab");
    else params.set("tab", activeTab);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [activeTab, searchParams, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
      </div>
    );
  }

  // "Not found" is one answer among several: a failed read or a login that may
  // not open the shop must not tell staff the shop does not exist.
  if (isError && !data && loadFailureKind(error) !== "missing") {
    return <LoadError what="this shop" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (!data) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Link
          href="/merchants"
          className="inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Merchants
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-foreground/70">
          <UserCircle className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">Merchant not found</p>
        </div>
      </div>
    );
  }

  const { tenant, wallet, subscription, usage, team, notes, orderCount } = data;
  const primaryColor = tenant.branding?.primary_color || "#1E1E1E";

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back button */}
      <Link
        href="/merchants"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Merchants
      </Link>

      {/* Prospect Banner */}
      {tenant.is_prospect && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-400/20 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">This is a pre-built prospect store</p>
              <p className="text-[13px] text-amber-700 dark:text-amber-300">Created for a potential merchant. Not yet converted.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tenant.prospect_lead_id && (
              <Link
                href={`/leads/${tenant.prospect_lead_id}`}
                className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-[13px] font-semibold text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200 dark:hover:bg-amber-400/25"
              >
                View Lead Details
              </Link>
            )}
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-2 text-sm text-foreground/70">
                <span>{tenant.slug}</span>
                <span className="w-0.5 h-0.5 rounded-full bg-foreground/20 shrink-0" />
                <CopyableText
                  value={`#${getMerchantCode(tenant)}`}
                  display={`#${getMerchantCode(tenant)}`}
                  className="font-bold tabular-nums text-foreground/70"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              href={`https://${storeAddress(tenant.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open store
            </a>
            {canViewAsMerchant && <SupportViewButton tenantId={tenant.id} />}
          </div>
        </div>
        <div className="mt-4 border-t border-[var(--card-border)] pt-4">
          <ShopStatus line={shopStatusLine(data)} planLabel={planLabel(tenant.plan)} />
        </div>
      </div>

      <ShopActions
        shopId={tenant.id}
        facts={{
          status: tenant.status,
          locked: !!data.billingLock?.locked,
          subscriptionRunning: isSubscriptionRunning(subscription?.status),
        }}
        plan={tenant.plan}
        balance={wallet?.balance_iqd ?? 0}
        freeDaysFrom={tenant.status === "trial" ? tenant.trial_ends_at : (subscription?.current_period_end ?? null)}
        onGiveOrders={() => {
          setActiveTab("Overview");
          // The tab switch has rendered by the next frame, so the lock card is there.
          requestAnimationFrame(() =>
            document
              .querySelector('[data-testid="billing-lock-card"]')
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          );
        }}
        onAddNote={() => {
          setFocusNote(true);
          setActiveTab("Timeline");
        }}
      />

      {tenant.status === "limited" && (
        <LimitedBanner merchantId={tenant.id} restrictions={(tenant.restrictions ?? null) as TenantRestrictions | null} />
      )}

      <PinnedNoteStrip notes={notes} onOpenNotes={() => setActiveTab("Timeline")} />

      {/* The shop's numbers, all on one plain surface. */}
      <dl className="pastel-card grid grid-cols-2 divide-x divide-[var(--card-border)] md:grid-cols-4">
        {[
          { label: "Wallet, now", value: formatIQD(wallet?.balance_iqd ?? 0) },
          {
            label: "Wallet charges, all time",
            value: formatIQD(wallet?.total_charged_iqd ?? 0),
            title: "Everything the wallet has paid: plan, order and message fees, and any other charge",
          },
          { label: "Orders, all time", value: formatCount(orderCount) },
          { label: "Team now", value: formatCount(team.filter((member) => member.status === "active").length) },
        ].map((tile) => (
          <div key={tile.label} className="px-5 py-4" title={tile.title}>
            <dt className="text-[13px] text-foreground/70">{tile.label}</dt>
            <dd className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--card-border)] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setFocusNote(false);
              setActiveTab(tab);
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <OverviewTab
          merchantId={tenant.id}
          tenant={tenant}
          subscription={subscription}
          billingLock={data.billingLock}
          canForceUnlock={data.canForceUnlock}
        />
      )}
      {activeTab === "Overview" && <RecentOrdersSection merchantId={tenant.id} limit={5} />}
      {activeTab === "Timeline" && <TimelineTab merchantId={tenant.id} focusNote={focusNote} />}
      {activeTab === "Usage" && <UsageTab usage={usage} planLimits={data.planLimits} />}
      {activeTab === "Team" && <TeamTab team={team} />}
      {activeTab === "Onboarding" && (
        <OnboardingChecklist
          tenant={tenant}
          orderCount={orderCount}
          teamCount={team.length}
          walletBalance={wallet?.balance_iqd ?? 0}
          hasStorefront={!!(tenant.store_config && Object.keys(tenant.store_config).length > 0)}
        />
      )}
    </div>
  );
}
