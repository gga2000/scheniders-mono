"use client";

import { Globe, Link as LinkIcon } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface ProductStorefrontSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    autoGenerateSlug: () => void;
}

export function ProductStorefrontSection({ formData, updateField, autoGenerateSlug }: ProductStorefrontSectionProps) {
    const { t } = useLanguage();
    if (formData.is_supply) return null;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {t("products.ed.storefront")}
            </h2>

            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    {t("products.ed.urlHandle")}
                </label>
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                        <span className="px-3 text-sm text-foreground/70 border-e border-[var(--card-border)] bg-[var(--card-bg)] py-3 shrink-0">
                            /products/
                        </span>
                        <input
                            type="text"
                            value={formData.slug}
                            onChange={(e) => {
                                const slug = e.target.value
                                    .toLowerCase()
                                    .trim()
                                    .replace(/[^a-z0-9\s-]/g, "")
                                    .replace(/\s+/g, "-")
                                    .replace(/-+/g, "-");
                                updateField("slug", slug);
                            }}
                            placeholder="product-url-handle"
                            className="flex-1 px-3 py-3 bg-transparent text-foreground placeholder:text-[var(--foreground-muted)]/60 focus:outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={autoGenerateSlug}
                        disabled={!formData.name}
                        className="px-4 py-3 bg-[var(--pastel-yellow)] text-amber-900 rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {t("products.ed.autoGenerate")}
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    {t("products.ed.websitePrice")}
                    <span className="text-xs text-muted ms-1">{t("products.ed.websitePriceHint")}</span>
                </label>
                <input
                    type="number"
                    value={formData.website_price ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        updateField("website_price", v === "" ? null : parseInt(v, 10) || 0);
                    }}
                    placeholder={t("products.ed.websitePricePh").replace("{price}", formData.price.toLocaleString())}
                    min={0}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                />
            </div>
        </div>
    );
}
