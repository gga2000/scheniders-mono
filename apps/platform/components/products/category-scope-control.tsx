"use client";

import { Store, Globe, Layers } from "lucide-react";
import type { CategoryScope } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface CategoryScopeControlProps {
    value: CategoryScope;
    onChange: (next: CategoryScope) => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Who a category is for. Deliberately not a visibility toggle — a category can
 * be perfectly visible and still belong only to staff. `status` and
 * `is_visible` answer "is it shown"; this answers "shown to whom".
 */
const SCOPES: { value: CategoryScope; icon: typeof Store; labelKey: string }[] = [
    { value: "internal", icon: Store, labelKey: "categories.scope.internal" },
    { value: "website", icon: Globe, labelKey: "categories.scope.website" },
    { value: "both", icon: Layers, labelKey: "categories.scope.both" },
];

export function CategoryScopeControl({ value, onChange, disabled, className }: CategoryScopeControlProps) {
    const { t } = useLanguage();

    return (
        <div
            role="group"
            aria-label={t("categories.scope.label")}
            className={cn("flex bg-[var(--background)] rounded-lg p-0.5 border border-[var(--card-border)]", className)}
        >
            {SCOPES.map(({ value: scope, icon: Icon, labelKey }) => {
                const active = value === scope;
                return (
                    <button
                        key={scope}
                        type="button"
                        disabled={disabled}
                        aria-pressed={active}
                        title={`${t(labelKey)} — ${t(`${labelKey}Hint`)}`}
                        onClick={() => !active && onChange(scope)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors",
                            active ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground",
                            disabled && "opacity-50 cursor-not-allowed",
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="sr-only">{t(labelKey)}</span>
                    </button>
                );
            })}
        </div>
    );
}
