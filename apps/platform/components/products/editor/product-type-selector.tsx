"use client";

import { Package, Download, Clock, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductType = 'physical' | 'digital' | 'service' | 'bundle';

interface ProductTypeSelectorProps {
    value: ProductType;
    onChange: (type: ProductType) => void;
    disabled?: boolean;
    mode?: "create" | "edit";
}

const PRODUCT_TYPES = [
    {
        type: 'physical' as const,
        label: 'Physical',
        description: 'Tangible goods with inventory & shipping',
        icon: Package,
        color: 'bg-emerald-100 text-emerald-700',
        activeColor: 'bg-emerald-500 text-white',
    },
    {
        type: 'digital' as const,
        label: 'Digital',
        description: 'Downloadable files & license keys',
        icon: Download,
        color: 'bg-blue-100 text-blue-700',
        activeColor: 'bg-blue-500 text-white',
    },
    {
        type: 'service' as const,
        label: 'Service',
        description: 'Time-based offerings & bookings',
        icon: Clock,
        color: 'bg-purple-100 text-purple-700',
        activeColor: 'bg-purple-500 text-white',
    },
    {
        type: 'bundle' as const,
        label: 'Bundle',
        description: 'Combine existing products as a kit',
        icon: Layers,
        color: 'bg-amber-100 text-amber-700',
        activeColor: 'bg-amber-500 text-white',
    },
];

export function ProductTypeSelector({ value, onChange, disabled, mode }: ProductTypeSelectorProps) {
    const handleSelect = (type: ProductType) => {
        if (disabled) return;
        if (mode === "edit" && type !== value) {
            const confirmed = window.confirm(
                "Changing product type will reset type-specific fields. Are you sure?"
            );
            if (!confirmed) return;
        }
        onChange(type);
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                Product Type
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PRODUCT_TYPES.map((pt) => {
                    const isActive = value === pt.type;
                    const Icon = pt.icon;
                    return (
                        <button
                            key={pt.type}
                            type="button"
                            onClick={() => handleSelect(pt.type)}
                            className={cn(
                                "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                                isActive
                                    ? "border-[var(--ink)] bg-[var(--ink)]/5 shadow-sm"
                                    : "border-[var(--card-border)] hover:border-[var(--ink)]/30 bg-[var(--background)]",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                isActive ? pt.activeColor : pt.color
                            )}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className={cn(
                                    "text-sm font-semibold",
                                    isActive ? "text-foreground" : "text-muted"
                                )}>
                                    {pt.label}
                                </p>
                                <p className="text-xs text-muted mt-0.5 leading-tight">
                                    {pt.description}
                                </p>
                            </div>
                            {isActive && (
                                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--ink)]" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
