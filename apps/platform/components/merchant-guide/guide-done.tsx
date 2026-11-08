"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideCaption } from "./guide-caption";
import { GuideSoundButton } from "./guide-sound-button";
import { useGuideVoice } from "./use-guide-voice";

const R = 10;
const C = 2 * Math.PI * R;
const ITEMS = ["guide.done.item.shop", "guide.done.item.product", "guide.done.item.delivery", "guide.done.item.open"];

/** The finish of the basics: what is now true, and the shop link to share. */
export function GuideDone({
    locale,
    slug,
    tenantId,
    soundOn,
    onToggleSound,
    onClose,
}: {
    locale: GuideLocale;
    slug: string;
    tenantId: string;
    soundOn: boolean;
    onToggleSound: () => void;
    onClose: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const url = useStorefrontUrl(slug, tenantId);
    const [copied, setCopied] = useState<"yes" | "select" | null>(null);
    const voice = useGuideVoice("done.title", lineText("done.title", locale), locale, soundOn);

    const copy = (): void => {
        navigator.clipboard.writeText(url).then(
            () => setCopied("yes"),
            // Clipboard refused (older browser or no permission): select the
            // link so the merchant can copy it by hand.
            () => setCopied("select"),
        );
    };

    return (
        <div className="fixed inset-0 z-[47] grid place-items-center bg-black/50 p-4" data-testid="merchant-guide-done">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-guide-done-title"
                className="merchant-guide-card grid w-full max-w-[520px] gap-4 rounded-2xl bg-[var(--card-bg)] p-6 text-foreground shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            >
                <div className="flex items-start justify-between gap-3">
                    <svg viewBox="0 0 24 24" className="h-12 w-12 shrink-0" aria-hidden="true">
                        <circle cx="12" cy="12" r={R} fill="none" stroke="var(--card-border)" strokeWidth="2.5" />
                        <circle
                            cx="12"
                            cy="12"
                            r={R}
                            fill="none"
                            stroke="#16A34A"
                            strokeWidth="2.5"
                            strokeDasharray={`${C} ${C}`}
                            transform="rotate(-90 12 12)"
                        />
                        <path d="m8 12.5 2.5 2.5L16 9.5" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} tone="light" />
                </div>
                <h2 id="merchant-guide-done-title" className="text-xl font-bold">{t("guide.done.title")}</h2>
                <GuideCaption voice={voice} className="text-[15px]" />
                <ul className="grid gap-2 text-sm">
                    {ITEMS.map((key) => (
                        <li key={key} className="flex items-center gap-2">
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                            <span dir={dir} className="text-left">{t(key)}</span>
                        </li>
                    ))}
                </ul>
                <p dir={dir} className="text-left text-sm text-muted-foreground">{lineText("done.share", locale)}</p>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-2">
                    <input
                        readOnly
                        value={url}
                        aria-label={t("guide.done.copy")}
                        onFocus={(e) => e.currentTarget.select()}
                        ref={(el) => {
                            if (el && copied === "select") el.select();
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none"
                        dir="ltr"
                    />
                    <button
                        type="button"
                        onClick={copy}
                        data-testid="merchant-guide-copy-link"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        {copied === "yes" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                        {copied === "yes" ? t("guide.done.copied") : t("guide.done.copy")}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    data-testid="merchant-guide-done-close"
                    className="h-11 justify-self-start rounded-xl bg-neutral-900 px-6 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                >
                    {t("guide.done.close")}
                </button>
            </div>
        </div>
    );
}
