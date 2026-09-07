"use client";

import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { RichTextEditor } from "./rich-text-editor";

interface ProductBasicSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function ProductBasicSection({ formData, updateField }: ProductBasicSectionProps) {
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Product Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="e.g., Dior Sauvage"
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Short Name
                        <span className="text-xs text-muted ml-1">(internal)</span>
                    </label>
                    <input
                        type="text"
                        value={formData.short_name}
                        onChange={(e) => updateField("short_name", e.target.value)}
                        placeholder="e.g., انفوي"
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                    <p className="text-xs text-muted mt-1">
                        Product Name is the full customer-facing title shown on the website and
                        used for marketing. Short Name is what your team sees on orders, printing
                        and labels — keep it brief for quick identification. Leave empty to use
                        the full name everywhere.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        SKU
                        <span className="text-xs text-muted ml-1">(LightFunnels)</span>
                    </label>
                    <input
                        type="text"
                        value={formData.sku}
                        onChange={(e) => updateField("sku", e.target.value)}
                        placeholder="e.g., DIOR-SAU-100"
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    Description
                </label>
                <RichTextEditor
                    value={formData.description}
                    onChange={(html) => updateField("description", html)}
                    placeholder="Write your product description..."
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                    Short Description
                    <span className="text-xs text-muted ml-1">(shown on product cards, max 200 chars)</span>
                </label>
                <textarea
                    value={formData.short_description}
                    onChange={(e) => updateField("short_description", e.target.value)}
                    placeholder="Brief tagline or 1-2 sentence summary..."
                    rows={2}
                    maxLength={200}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                />
                <p className="text-xs text-muted mt-1 text-right">
                    {formData.short_description.length}/200
                </p>
            </div>
        </div>
    );
}
