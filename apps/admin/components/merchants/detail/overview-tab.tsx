"use client";

import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { SubscriptionCard } from "./subscription-card";
import { CopyableText } from "@/components/shared/copyable-text";

interface OverviewTabProps {
  merchantId: string;
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
}

export function OverviewTab({ merchantId, tenant, subscription }: OverviewTabProps) {
  const infoRows: Array<{
    label: string;
    value: string | null | undefined;
    copyable?: boolean;
  }> = [
    { label: "Contact Email", value: tenant.contact_email, copyable: true },
    { label: "Contact Phone", value: tenant.contact_phone, copyable: true },
    { label: "Address", value: tenant.address, copyable: true },
    { label: "City", value: tenant.city, copyable: true },
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
    <div className="space-y-4">
      <SubscriptionCard
        merchantId={merchantId}
        tenant={tenant}
        subscription={subscription}
      />

      <div className="pastel-card p-5 md:p-6">
      <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4">
        Tenant Information
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {infoRows.map((row) => (
          <div key={row.label} className="flex flex-col py-1.5 group/row">
            <span className="text-xs text-foreground/50 font-medium">{row.label}</span>
            {row.copyable && row.value ? (
              <CopyableText
                value={row.value}
                className="text-sm font-semibold text-foreground mt-0.5"
              />
            ) : (
              <span className="text-sm font-semibold text-foreground mt-0.5">
                {row.value || "\u2014"}
              </span>
            )}
          </div>
        ))}
      </div>

      {tenant.settings && Object.keys(tenant.settings).length > 0 && (
        <div className="mt-6 pt-4 border-t border-[var(--card-border)]">
          <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">
            Locale
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3">
            {(["currency", "language", "timezone"] as const).map((key) => {
              const value = (tenant.settings as Record<string, unknown> | null)?.[key];
              if (typeof value !== "string") return null;
              return (
                <div key={key} className="flex flex-col py-1.5">
                  <span className="text-xs text-foreground/50 font-medium capitalize">
                    {key}
                  </span>
                  <span className="text-sm font-semibold text-foreground mt-0.5">
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
