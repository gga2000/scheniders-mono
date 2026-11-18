"use client";

import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { SubscriptionCard } from "./subscription-card";
import { BillingLockCard } from "./billing-lock-card";
import { CopyableText } from "@/components/shared/copyable-text";
import { formatDay } from "@/lib/format";

interface OverviewTabProps {
  merchantId: string;
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
  billingLock: MerchantDetail["billingLock"];
  canForceUnlock: boolean;
}

const LOCALE_LABEL = { currency: "Currency", language: "Language", timezone: "Time zone" } as const;
/** The shop's language code in words; an unknown code stays as it is. */
const LANGUAGE_NAME: Record<string, string> = { ar: "Arabic", en: "English", ku: "Kurdish" };

export function OverviewTab({
  merchantId,
  tenant,
  subscription,
  billingLock,
  canForceUnlock,
}: OverviewTabProps) {
  const settings = tenant.settings ?? {};
  const locale = (["currency", "language", "timezone"] as const)
    .map((key) => ({ key, value: settings[key] }))
    .filter((row): row is { key: "currency" | "language" | "timezone"; value: string } => typeof row.value === "string");
  // The trial, the month and the plan are in the status line and the card above.
  const details: Array<{ label: string; value: string | null | undefined; copyable?: boolean }> = [
    { label: "Email", value: tenant.contact_email, copyable: true },
    { label: "Phone", value: tenant.contact_phone, copyable: true },
    { label: "Address", value: tenant.address, copyable: true },
    { label: "City", value: tenant.city, copyable: true },
    { label: "Opened", value: tenant.created_at ? formatDay(tenant.created_at) : null },
    ...locale.map((row) => ({
      label: LOCALE_LABEL[row.key],
      value: row.key === "language" ? (LANGUAGE_NAME[row.value] ?? row.value) : row.value,
    })),
  ];

  return (
    <div className="space-y-4">
      {billingLock?.locked && (
        <BillingLockCard
          merchantId={merchantId}
          lock={billingLock}
          canForceUnlock={canForceUnlock}
          shopPaused={tenant.status === "limited"}
        />
      )}

      <SubscriptionCard merchantId={merchantId} tenant={tenant} subscription={subscription} />

      <section className="pastel-card p-5" aria-label="Shop details">
        <h2 className="mb-4 text-[15px] font-semibold text-foreground">Shop details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
          {details.map((row) => (
            <div key={row.label}>
              <dt className="text-[13px] text-foreground/70">{row.label}</dt>
              <dd className="mt-1 text-[15px] font-medium text-foreground">
                {row.copyable && row.value ? <CopyableText value={row.value} /> : row.value || "None"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
