"use client";

import { useState, type CSSProperties } from "react";
import { Check, Copy, ExternalLink, ImageIcon, Store } from "lucide-react";
import { formatIQD } from "@scheniders/shared";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideCaption } from "./guide-caption";
import { GuideSoundButton } from "./guide-sound-button";
import { useGuideVoice } from "./use-guide-voice";
import type { GuideFirstProduct } from "./use-merchant-guide-data";

const R = 10;
const C = 2 * Math.PI * R;
const ITEMS = ["guide.done.item.shop", "guide.done.item.product", "guide.done.item.delivery", "guide.done.item.open"];

/**
 * The finish of the basics. The reward is the thing the merchant just made:
 * their own name, logo and first product drawn as a small shop, with the link
 * to share and a way to open the real shop.
 */
export function GuideDone({
    locale,
    slug,
    tenantId,
    shopName,
    logoUrl,
    firstProduct,
    soundOn,
    onToggleSound,
    onClose,
}: {
    locale: GuideLocale;
    slug: string;
    tenantId: string;
    shopName: string;
    logoUrl: string;
    firstProduct: GuideFirstProduct | null;
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
        <div className="fixed inset-0 z-[47] grid place-items-center bg-black/55 p-4" data-testid="merchant-guide-done">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-guide-done-title"
                className="merchant-guide-card relative grid w-full max-w-[520px] justify-items-center gap-4 rounded-2xl bg-[var(--card-bg)] px-6 pb-6 pt-8 text-center text-foreground shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            >
                <div className="absolute right-3 top-3">
                    <GuideSoundButton soundOn={soundOn} speaking={voice.speaking} onToggle={onToggleSound} tone="light" />
                </div>

                <div className="relative h-16 w-16" aria-hidden="true">
                    <div className="merchant-guide-burst" />
                    <svg viewBox="0 0 24 24" className="relative h-16 w-16">
                        <circle cx="12" cy="12" r={R} fill="var(--card-bg)" stroke="var(--card-border)" strokeWidth="2" />
                        <circle
                            className="merchant-guide-done-fill"
                            cx="12"
                            cy="12"
                            r={R}
                            fill="none"
                            stroke="#16A34A"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={C}
                            strokeDashoffset={0}
                            style={{ "--ring-length": `${C}` } as CSSProperties}
                            transform="rotate(-90 12 12)"
                        />
                        <path
                            className="merchant-guide-done-tick"
                            d="m8 12.5 2.5 2.5L16 9.5"
                            fill="none"
                            stroke="#16A34A"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={14}
                            strokeDashoffset={0}
                        />
                    </svg>
                </div>

                <div className="grid gap-1">
                    <h2 id="merchant-guide-done-title" className="text-2xl font-bold">{t("guide.done.title")}</h2>
                    <GuideCaption voice={voice} className="text-[15px] text-muted-foreground" />
                </div>

                <div className="grid w-full gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-left" data-testid="merchant-guide-done-preview">
                    <p dir={dir} className="text-xs text-muted-foreground">{t("guide.done.preview")}</p>
                    <div className="flex items-center gap-2">
                        {logoUrl ? (
                            // Merchant logos live on any host; next/image would need each one allow-listed.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-[var(--card-border)] bg-white object-contain" />
                        ) : (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
                                <Store className="h-4 w-4" aria-hidden="true" />
                            </span>
                        )}
                        <span dir="auto" className="min-w-0 truncate font-bold">{shopName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid min-w-0 content-start gap-1">
                            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-muted">
                                {firstProduct?.imageUrl ? (
                                    // Product photos live on any host; same reason as the logo above.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={firstProduct.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                                )}
                            </div>
                            {firstProduct && (
                                <>
                                    <span dir="auto" className="truncate text-sm">{firstProduct.name}</span>
                                    <span className="text-sm font-bold tabular-nums">{formatIQD(firstProduct.price)}</span>
                                </>
                            )}
                        </div>
                        <ul className="grid content-start gap-2 text-sm">
                            {ITEMS.map((key) => (
                                <li key={key} className="flex items-center gap-1.5">
                                    <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                                    <span dir={dir}>{t(key)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <p dir={dir} className="text-sm text-muted-foreground">{lineText("done.share", locale)}</p>
                <input
                    readOnly
                    value={url}
                    aria-label={t("guide.done.copy")}
                    onFocus={(e) => e.currentTarget.select()}
                    ref={(el) => {
                        if (el && copied === "select") el.select();
                    }}
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-center text-sm tabular-nums outline-none"
                    dir="ltr"
                />
                <div className="grid w-full grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={copy}
                        data-testid="merchant-guide-copy-link"
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 text-sm font-semibold text-white hover:opacity-90 dark:bg-[#EFFF00] dark:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00] dark:focus-visible:ring-white"
                    >
                        {copied === "yes" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                        {copied === "yes" ? t("guide.done.copied") : t("guide.done.copy")}
                    </button>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="merchant-guide-open-shop"
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                    >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        {t("guide.done.view")}
                    </a>
                </div>

                <p dir={dir} className="text-sm">{t("guide.done.unlocked")}</p>
                <button
                    type="button"
                    onClick={onClose}
                    data-testid="merchant-guide-done-close"
                    className="h-10 rounded-xl px-6 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                >
                    {t("guide.done.close")}
                </button>
            </div>
        </div>
    );
}
