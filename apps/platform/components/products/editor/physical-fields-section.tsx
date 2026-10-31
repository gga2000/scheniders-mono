"use client";

import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface PhysicalFieldsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function PhysicalFieldsSection({ formData, updateField }: PhysicalFieldsSectionProps) {
    const { t } = useLanguage();
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.weight")}
                    </label>
                    <input
                        type="number"
                        value={formData.weight ?? ""}
                        onChange={(e) => updateField("weight", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.length")}
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_length ?? ""}
                        onChange={(e) => updateField("dimensions_length", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.width")}
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_width ?? ""}
                        onChange={(e) => updateField("dimensions_width", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.ed.height")}
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_height ?? ""}
                        onChange={(e) => updateField("dimensions_height", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>
        </div>
    );
}
