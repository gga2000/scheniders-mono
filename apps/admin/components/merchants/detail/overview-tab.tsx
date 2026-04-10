"use client";

import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

interface OverviewTabProps {
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
}

export function OverviewTab({ tenant, subscription }: OverviewTabProps) {
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
