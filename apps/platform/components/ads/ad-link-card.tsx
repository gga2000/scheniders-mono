"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { META_URL_PARAMETERS, type AttributionCoverage } from "@/lib/ads-report";

export function AdLinkCard({ coverage }: { coverage: AttributionCoverage }) {
    const { t } = useLanguage();
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(META_URL_PARAMETERS);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard blocked: the string stays selectable in the box below.
            setCopied(false);
        }
    };

    return (
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("ads.linkTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t("ads.linkHelp")}</p>
            <div className="mt-3 flex items-start gap-2">
                <code
                    id="meta-url-parameters"
                    className="min-w-0 flex-1 select-all break-all rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs"
                    dir="ltr"
                >
                    {META_URL_PARAMETERS}
                </code>
                <button
                    type="button"
                    onClick={copy}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t("ads.copied") : t("ads.copy")}
                </button>
            </div>
            <p className="mt-3 text-sm text-foreground">
                {coverage.pct === null
                    ? t("ads.coverageNone")
                    : t("ads.coverage")
                          .replace("{with}", String(coverage.withAdId))
                          .replace("{total}", String(coverage.adOrders))
                          .replace("{pct}", String(coverage.pct))}
            </p>
        </section>
    );
}
