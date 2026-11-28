"use client";

import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { RichTextEditor } from "./rich-text-editor";
import { useLanguage } from "@/hooks/use-language";
import { useBusinessTypes } from "@/hooks/use-tenant";
import { examplePlaceholder } from "@/lib/business-types";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";

interface ProductBasicSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function ProductBasicSection({ formData, updateField }: ProductBasicSectionProps) {
    const { t, language } = useLanguage();
    // A clothing shop sees a shirt as the example, never a perfume (B10).
    const businessTypes = useBusinessTypes();
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                {t("products.ed.basic")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* The setup guide lights this field alone, not the whole box. */}
                <div data-guide="product-name">
                    <label htmlFor="product-name" className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.name")} <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                        <input
                            id="product-name"
                            type="text"
                            dir="auto"
                            value={formData.name}
                            onChange={(e) => updateField("name", e.target.value)}
                            placeholder={examplePlaceholder(businessTypes, "product_i18n", language, t("products.ed.namePh"))}
                            className="w-full pl-4 pr-12 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                        />
                        <VoiceMicButton
                            value={formData.name}
                            onValueChange={(next) => updateField("name", next)}
                            className="right-2.5 top-1/2 -translate-y-1/2"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="product-short-name" className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.shortName")}
                        <span className="text-xs text-muted ms-1">{t("products.ed.internal")}</span>
                    </label>
                    <input
                        id="product-short-name"
                        type="text"
                        dir="auto"
                        value={formData.short_name}
                        onChange={(e) => updateField("short_name", e.target.value)}
                        placeholder={t("products.ed.shortNamePh")}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                    <p className="text-xs text-muted mt-1">{t("products.ed.shortNameHint")}</p>
                </div>

                <div>
                    <label htmlFor="product-sku" className="block text-sm font-medium text-foreground mb-2">
                        SKU
                    </label>
                    <input
                        id="product-sku"
                        type="text"
                        value={formData.sku}
                        onChange={(e) => updateField("sku", e.target.value)}
                        placeholder={t("products.ed.skuPh")}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            <div>
                <p id="product-description-label" className="block text-sm font-medium text-foreground mb-2">
                    {t("products.ed.description")}
                </p>
                <RichTextEditor
                    labelledBy="product-description-label"
                    value={formData.description}
                    onChange={(html) => updateField("description", html)}
                    placeholder={t("products.ed.descriptionPh")}
                />
            </div>

            <div>
                <label htmlFor="product-short-description" className="block text-sm font-medium text-foreground mb-2">
                    {t("products.ed.shortDescription")}
                    <span className="text-xs text-muted ms-1">{t("products.ed.shortDescriptionHint")}</span>
                </label>
                <div className="relative">
                    <textarea
                        id="product-short-description"
                        dir="auto"
                        value={formData.short_description}
                        onChange={(e) => updateField("short_description", e.target.value)}
                        placeholder={t("products.ed.shortDescriptionPh")}
                        rows={2}
                        maxLength={200}
                        className="w-full pl-4 pr-12 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                    />
                    <VoiceMicButton
                        value={formData.short_description}
                        onValueChange={(next) => updateField("short_description", next)}
                        maxLength={200}
                        className="right-2.5 top-2.5"
                    />
                </div>
                <p className="text-xs text-muted mt-1 text-end">
                    {formData.short_description.length}/200
                </p>
            </div>
        </div>
    );
}
