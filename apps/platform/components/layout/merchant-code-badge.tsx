"use client";

import { useState } from "react";
import { Hash, Check, Copy } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getMerchantCode } from "@scheniders/shared";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/utils";

/**
 * Shows the merchant's stable 6-digit code in the platform topbar.
 * Click to copy. Useful for support: merchant reads the code aloud,
 * admin pastes it into the merchants search.
 *
 * Reads the canonical `display_id` from the tenants row when available;
 * falls back to a UUID hash for the brief window before the migration runs.
 */
export function MerchantCodeBadge() {
  const { tenantId } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: tenantRow } = useTenant();

  if (!tenantId) return null;
  const code = getMerchantCode({
    id: tenantId,
    display_id: tenantRow?.display_id ?? null,
  });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`#${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard might be blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : `Merchant ID — click to copy`}
      aria-label={`Merchant ID #${code}`}
      className={cn(
        "group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all",
        "bg-(--card-bg) border border-(--card-border) hover:border-(--foreground-muted)",
        "text-foreground hover:scale-[1.02] active:scale-[0.98]"
      )}
    >
      <Hash className="w-3 h-3 text-violet-500 dark:text-violet-400 shrink-0" />
      <span className="text-[11px] font-black tabular-nums tracking-wide">
        {code}
      </span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 text-foreground/35 group-hover:text-foreground/60 shrink-0 transition-colors" />
      )}
    </button>
  );
}
