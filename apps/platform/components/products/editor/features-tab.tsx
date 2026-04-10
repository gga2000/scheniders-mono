"use client";

import { useState } from "react";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { IconPicker, renderIcon } from "./icon-picker";

export interface FeatureFormData {
    icon: string;
    title: string;
    description: string;
    display_order: number;
}

interface FeaturesTabProps {
    features: FeatureFormData[];
    onChange: (features: FeatureFormData[]) => void;
}

export function FeaturesTab({ features, onChange }: FeaturesTabProps) {
    const addFeature = () => {
        onChange([
            ...features,
            { icon: "Star", title: "", description: "", display_order: features.length },
        ]);
    };

    const updateFeature = (index: number, updates: Partial<FeatureFormData>) => {
        const updated = features.map((f, i) =>
            i === index ? { ...f, ...updates } : f
        );
        onChange(updated);
    };

    const removeFeature = (index: number) => {
        const updated = features
            .filter((_, i) => i !== index)
            .map((f, i) => ({ ...f, display_order: i }));
        onChange(updated);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={addFeature}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Feature
                </button>
            </div>

            {/* Empty state */}
            {features.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Sparkles className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No features added. Highlight key product features to help customers decide.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4 space-y-3"
                        >
                            {/* Top row: icon picker, title, delete */}
                            <div className="flex items-center gap-3">
                                <IconPicker
                                    value={feature.icon}
                                    onChange={(iconName) =>
                                        updateFeature(index, { icon: iconName })
                                    }
                                />
                                <input
                                    type="text"
                                    value={feature.title}
                                    onChange={(e) =>
                                        updateFeature(index, { title: e.target.value })
                                    }
                                    placeholder="Feature title"
                                    className="flex-1 px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeFeature(index)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Description */}
                            <textarea
                                value={feature.description}
                                onChange={(e) =>
                                    updateFeature(index, { description: e.target.value })
                                }
                                placeholder="Feature description"
                                rows={2}
                                className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] resize-none"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

