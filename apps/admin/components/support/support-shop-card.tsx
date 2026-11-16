"use client";

import Link from "next/link";
import { ExternalLink, Pin } from "lucide-react";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/types/admin";
import { SupportShopCheck } from "@/components/support/support-shop-check";
import { SUPPORT_REASON_LABELS, SUPPORT_STATUS_LABELS, type SupportShopCard as ShopCard } from "@/lib/support";
import { formatIQD } from "@/lib/format";


function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isPlanTier(plan: string): plan is PlanTier {
  return PLAN_TIERS.some((tier) => tier === plan);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Who is writing to us: the facts staff need before they answer. */
export function SupportShopCard({ shop, caseId }: { shop: ShopCard; caseId: string }) {
  const { tenant } = shop;
  const planLabel = isPlanTier(tenant.plan) ? PLAN_LABELS[tenant.plan] : tenant.plan;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--card-border)] p-4">
        <p dir="auto" className="text-base font-bold text-foreground">
          {tenant.business_name}
        </p>
        <p className="mt-0.5 text-xs text-foreground-muted">
          {tenant.display_id ? `Shop #${tenant.display_id}` : "Shop"}
          {tenant.city ? ` · ${tenant.city}` : ""}
        </p>
        <Link
          href={`/merchants/${tenant.id}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open merchant page
        </Link>
      </div>

      <div className="border-b border-[var(--card-border)] p-4">
        <SupportShopCheck key={caseId} caseId={caseId} />
      </div>

      <dl className="divide-y divide-[var(--card-border)] px-4">
        <Row label="Plan" value={planLabel} />
        <Row label="Status" value={<span className="capitalize">{tenant.status}</span>} />
        {tenant.status === "trial" && tenant.trial_ends_at && (
          <Row label="Trial ends" value={formatDay(tenant.trial_ends_at)} />
        )}
        {shop.subscriptionEndsAt && <Row label="Renews" value={formatDay(shop.subscriptionEndsAt)} />}
        <Row
          label="Wallet"
          value={shop.walletBalanceIqd === null ? "No wallet" : formatIQD(shop.walletBalanceIqd)}
        />
        <Row label="Orders, last 7 days" value={shop.ordersLast7Days.toLocaleString("en-US")} />
        <Row label="Orders, all time" value={shop.ordersTotal.toLocaleString("en-US")} />
        <Row label="Team" value={shop.teamSize.toLocaleString("en-US")} />
        <Row label="Joined" value={formatDay(tenant.created_at)} />
        {tenant.contact_phone && <Row label="Phone" value={<span dir="ltr">{tenant.contact_phone}</span>} />}
      </dl>

      {shop.pinnedNotes.length > 0 && (
        <div className="border-t border-[var(--card-border)] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/50">
            <Pin className="h-3.5 w-3.5" />
            Pinned notes
          </p>
          <ul className="space-y-2">
            {shop.pinnedNotes.map((note) => (
              <li key={note.id} dir="auto" className="rounded-lg bg-amber-50 p-2.5 text-[13px] text-foreground">
                {note.content}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-[var(--card-border)] p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/50">
          Earlier conversations
        </p>
        {shop.earlierCases.length === 0 ? (
          <p className="text-[13px] text-foreground-muted">First time this shop writes to us.</p>
        ) : (
          <ul className="space-y-1.5">
            {shop.earlierCases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-foreground">
                  {c.reason ? SUPPORT_REASON_LABELS[c.reason] : SUPPORT_STATUS_LABELS[c.status]}
                </span>
                <span className="text-xs text-foreground-muted">{formatDay(c.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
