"use client";

import { useState } from "react";
import { Plus, Settings, Trash2, X } from "lucide-react";

export interface ProductOptionFormData {
    id?: string;
    name: string;
    values: string[];
}

interface VariantOptionsBuilderProps {
    options: ProductOptionFormData[];
    onChange: (options: ProductOptionFormData[]) => void;
    disabled?: boolean;
}

export function VariantOptionsBuilder({ options, onChange, disabled }: VariantOptionsBuilderProps) {
    const [valueInputs, setValueInputs] = useState<Record<number, string>>({});

    const addOption = () => {
        onChange([...options, { name: "", values: [] }]);
    };

    const removeOption = (index: number) => {
        const updated = options.filter((_, i) => i !== index);
        onChange(updated);
        setValueInputs((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
    };

    const updateOptionName = (index: number, name: string) => {
        const updated = options.map((opt, i) => (i === index ? { ...opt, name } : opt));
        onChange(updated);
    };

    const addValue = (optionIndex: number, raw: string) => {
        const value = raw.trim();
        if (!value) return;
        const option = options[optionIndex];
        if (option.values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
        const updated = options.map((opt, i) =>
            i === optionIndex ? { ...opt, values: [...opt.values, value] } : opt
        );
        onChange(updated);
        setValueInputs((prev) => ({ ...prev, [optionIndex]: "" }));
    };

    const removeValue = (optionIndex: number, valueIndex: number) => {
        const updated = options.map((opt, i) =>
            i === optionIndex
                ? { ...opt, values: opt.values.filter((_, vi) => vi !== valueIndex) }
                : opt
        );
        onChange(updated);
    };

    const handleValueKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        optionIndex: number
    ) => {
        const input = valueInputs[optionIndex] || "";
        if (e.key === "Enter") {
            e.preventDefault();
            addValue(optionIndex, input);
        } else if (e.key === ",") {
            e.preventDefault();
            addValue(optionIndex, input);
        }
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Product Options
                </h2>
                {!disabled && (
                    <button
                        type="button"
                        onClick={addOption}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Option
                    </button>
                )}
            </div>

            {options.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Settings className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No options defined. Add options like Size, Color, or Material to create variants.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {options.map((option, index) => (
                        <div
                            key={option.id || index}
                            className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <label className="block text-xs text-muted mb-1">
                                            Option name
                                        </label>
                                        <input
                                            type="text"
                                            value={option.name}
                                            onChange={(e) => updateOptionName(index, e.target.value)}
                                            placeholder="e.g., Size, Color, Material"
                                            readOnly={disabled}
                                            className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs text-muted mb-1">
                                            Option values
                                        </label>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {option.values.map((value, valueIndex) => (
                                                <span
                                                    key={valueIndex}
                                                    className="px-2.5 py-1 bg-[var(--pastel-blue)] text-blue-800 rounded-lg text-sm font-medium flex items-center gap-1.5"
                                                >
                                                    {value}
                                                    {!disabled && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeValue(index, valueIndex)}
                                                            className="text-blue-600 hover:text-blue-900"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </span>
                                            ))}
                                            {!disabled && (
                                                <input
                                                    type="text"
                                                    value={valueInputs[index] || ""}
                                                    onChange={(e) =>
                                                        setValueInputs((prev) => ({
                                                            ...prev,
                                                            [index]: e.target.value,
                                                        }))
                                                    }
                                                    onKeyDown={(e) => handleValueKeyDown(e, index)}
                                                    placeholder="Type and press Enter"
                                                    className="flex-1 min-w-[140px] px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => removeOption(index)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
