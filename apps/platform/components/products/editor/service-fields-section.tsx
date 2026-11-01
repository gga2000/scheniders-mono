"use client";

import { Clock, Calendar } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface ServiceFieldsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
}

export function ServiceFieldsSection({ formData, updateField }: ServiceFieldsSectionProps) {
    const { t } = useLanguage();
    const hours = Math.floor((formData.duration_minutes || 0) / 60);
    const minutes = (formData.duration_minutes || 0) % 60;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t("products.service.title")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.service.duration")}
                    </label>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <div className="relative">
                                <input
                                    type="number"
                                    value={hours || ""}
                                    onChange={(e) => {
                                        const h = parseInt(e.target.value) || 0;
                                        updateField("duration_minutes", h * 60 + minutes);
                                    }}
                                    placeholder="0"
                                    min={0}
                                    className="w-full px-4 py-3 pr-12 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">hrs</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="relative">
                                <input
                                    type="number"
                                    value={minutes || ""}
                                    onChange={(e) => {
                                        const m = Math.min(59, parseInt(e.target.value) || 0);
                                        updateField("duration_minutes", hours * 60 + m);
                                    }}
                                    placeholder="0"
                                    min={0}
                                    max={59}
                                    className="w-full px-4 py-3 pr-12 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">min</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        {t("products.service.booking")}
                    </label>
                    <div className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={formData.booking_enabled || false}
                                onClick={() => updateField("booking_enabled", !formData.booking_enabled)}
                                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                                    formData.booking_enabled ? "bg-emerald-500" : "bg-gray-300"
                                }`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                                        formData.booking_enabled ? "translate-x-5" : "translate-x-0"
                                    }`}
                                />
                            </button>
                            <div>
                                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {t("products.service.enableBooking")}
                                </p>
                                <p className="text-xs text-muted">
                                    {t("products.service.enableBookingHint")}
                                </p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
