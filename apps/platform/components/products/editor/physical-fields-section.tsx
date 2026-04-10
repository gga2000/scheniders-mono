"use client";

import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface PhysicalFieldsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function PhysicalFieldsSection({ formData, updateField }: PhysicalFieldsSectionProps) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Weight (g)
                    </label>
                    <input
                        type="number"
                        value={formData.weight ?? ""}
                        onChange={(e) => updateField("weight", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Length (cm)
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_length ?? ""}
                        onChange={(e) => updateField("dimensions_length", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Width (cm)
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_width ?? ""}
                        onChange={(e) => updateField("dimensions_width", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Height (cm)
                    </label>
                    <input
                        type="number"
                        value={formData.dimensions_height ?? ""}
                        onChange={(e) => updateField("dimensions_height", e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder="0"
                        min={0}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>
        </div>
    );
}
