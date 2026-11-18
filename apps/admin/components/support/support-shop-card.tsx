"use client";

import Link from "next/link";
import { ExternalLink, Loader2, Phone, Pin, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/types/admin";
import { SupportShopCheck } from "@/components/support/support-shop-check";
import { SupportCallList } from "@/components/support/support-call-list";
import { SupportViewButton } from "@/components/support/support-view-button";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useSupportTakeShop } from "@/hooks/use-support-cases";
import { SUPPORT_REASON_LABELS, SUPPORT_STATUS_LABELS, type SupportShopCard as ShopCard } from "@/lib/support";
import { effectiveStatus } from "@/lib/effective-status";
import { formatDay, formatIQD } from "@/lib/format";

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
  const now = useLiveTick(60_000);

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
        <div className="mt-2">
          <SupportViewButton tenantId={tenant.id} />
        </div>
      </div>

      <ShopOwner tenantId={tenant.id} owner={shop.owner} />

      <div className="border-b border-[var(--card-border)] p-4">
        <SupportShopCheck key={caseId} caseId={caseId} />
      </div>

      <dl className="divide-y divide-[var(--card-border)] px-4">
        <Row label="Plan" value={planLabel} />
        {/* "Paused", the word the shop page and the check above use for a pause. */}
        <Row label="Status" value={<span className="capitalize">{tenant.status === "limited" ? "paused" : tenant.status}</span>} />
        {/* A paused trial still ends, and "Needs us" lists it as "Trial ends soon". */}
        {effectiveStatus(tenant.status, tenant.restrictions) === "trial" && tenant.trial_ends_at && (
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
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/70">
            <Pin className="h-3.5 w-3.5" />
            Pinned notes
          </p>
          <ul className="space-y-2">
            {shop.pinnedNotes.map((note) => (
              <li key={note.id} dir="auto" className="rounded-lg bg-amber-500/5 p-2.5 text-[13px] text-foreground">
                {note.content}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shop.calls.length > 0 && (
        <div className="border-t border-[var(--card-border)] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/70">
            <Phone className="h-3.5 w-3.5" />
            Last calls
          </p>
          <SupportCallList calls={shop.calls} now={now} />
        </div>
      )}

      <div className="border-t border-[var(--card-border)] p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/70">
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

/** The shop's named support person, the one its Help chat shows. */
function ShopOwner({ tenantId, owner }: { tenantId: string; owner: ShopCard["owner"] }) {
  const take = useSupportTakeShop();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-foreground-muted">Support person</p>
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          {owner === null ? "Nobody yet" : owner.isMe ? "You" : <span dir="auto">{owner.name}</span>}
        </p>
      </div>
      {!owner?.isMe && (
        <button
          type="button"
          disabled={take.isPending}
          onClick={() =>
            take.mutate(tenantId, {
              onSuccess: () => toast.success("This shop is yours now. Its Help chat shows your name."),
              onError: (error) => toast.error(error.message),
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          {take.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Take this shop
        </button>
      )}
    </div>
  );
}
