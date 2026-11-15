"use client";

import { useState } from "react";
import { Hash, Check, Copy } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getMerchantCode } from "@scheniders/shared";
import { useTenant } from "@/hooks/use-tenant";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * Shows the merchant's stable 6-digit code in the platform topbar.
 * Click to copy. Useful for support: merchant reads the code aloud,
 * admin pastes it into the merchants search.
 *
 * Shows the store's `display_id` only. Every store has one (NOT NULL, from a
 * sequence); until the store row arrives the badge holds its place empty.
 * It used to show a code hashed from the store's UUID meanwhile, so for about
 * a second the store read as #573054 before turning into #100012.
 */
export function MerchantCodeBadge() {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const { data: tenantRow } = useTenant();

  if (!tenantId) return null;
  if (tenantRow?.display_id == null) {
    return <span aria-hidden className="inline-block h-[30px] w-[106px] rounded-full bg-(--card-bg) border border-(--card-border)" />;
  }
  const code = getMerchantCode({ display_id: tenantRow.display_id });

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
      title={copied ? t("layout.merchantCode.copied") : t("layout.merchantCode.copy")}
      aria-label={t("layout.merchantCode.label", { code })}
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
