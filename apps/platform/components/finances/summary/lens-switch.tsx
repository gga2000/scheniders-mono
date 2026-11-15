"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { LENSES, type Lens } from "@/lib/finance/summary";

interface LensSwitchProps {
    value: Lens;
    onChange: (lens: Lens) => void;
}

/** Total, per order, or per 1,000 IQD sold: one switch that re-reads every figure of the statement. */
export function LensSwitch({ value, onChange }: LensSwitchProps) {
    const { t } = useLanguage();
    return (
        <div className="inline-flex gap-0.5 rounded-full bg-[var(--background-soft)] p-1" role="group" aria-label={t("fin.lens.label")}>
            {LENSES.map((lens) => {
                const on = lens === value;
                return (
                    <button
                        key={lens}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(lens)}
                        data-lens={lens}
                        className={cn(
                            "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                            on
                                ? "bg-stone-900 text-stone-50 dark:bg-[#dcfb3a] dark:text-stone-900"
                                : "text-muted hover:text-foreground",
                        )}
                    >
                        {t(`fin.lens.${lens}`)}
                    </button>
                );
            })}
        </div>
    );
}
