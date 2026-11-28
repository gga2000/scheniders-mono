"use client";

// The shop's basics on the phone, ticking as each gets done (on the computer,
// most often). Labels come from the guide's own steps, so the list follows
// whatever the basics are.

import { Check } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { FOUNDATION_STEPS, type FoundationStatus } from "@/lib/merchant-guide/foundation";
import { FOUNDATION_PLACES } from "@/lib/merchant-guide/steps";
import { cn } from "@/lib/utils";

export function BasicsList({ status, loadFailed, onRetry }: { status: FoundationStatus | null; loadFailed: boolean; onRetry: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const done = status ? FOUNDATION_STEPS.filter((step) => status[step]).length : 0;
    const next = status ? FOUNDATION_STEPS.find((step) => !status[step]) : undefined;
    return (
        <section dir={dir} aria-labelledby="phone-basics-title" className="rounded-2xl border border-border bg-(--card-bg) px-4 py-3.5" data-testid="phone-basics">
            <div className="flex items-center justify-between">
                <h2 id="phone-basics-title" className="text-[14px] font-semibold">{t("computerSetup.basics")}</h2>
                <span dir="ltr" className="text-[13px] tabular-nums text-muted-foreground">
                    {t("computerSetup.progress", { done, total: FOUNDATION_STEPS.length })}
                </span>
            </div>
            {loadFailed ? (
                <div role="alert" className="mt-3 flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="text-muted-foreground">{t("computerSetup.loadFailed")}</span>
                    <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-4">
                        {t("computerSetup.scanner.retry")}
                    </button>
                </div>
            ) : (
                <ul className="mt-3 grid gap-2.5">
                    {FOUNDATION_STEPS.map((step) => {
                        const ok = status?.[step] === true;
                        const isNext = step === next;
                        return (
                            <li key={step} className="flex items-center gap-2.5 text-[14px]" data-testid={`phone-basic-${step}`} data-done={ok || undefined}>
                                <span
                                    className={cn(
                                        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-300",
                                        ok ? "border-[#1E1E1E] bg-[#1E1E1E] dark:border-[#EFFF00] dark:bg-[#EFFF00]" : isNext ? "border-foreground" : "border-border",
                                        status === null && "animate-pulse",
                                    )}
                                >
                                    {ok && <Check className="h-3.5 w-3.5 text-[#EFFF00] dark:text-[#1E1E1E]" strokeWidth={3} aria-hidden />}
                                </span>
                                <span className={cn(ok || isNext ? "text-foreground" : "text-muted-foreground", ok && "font-medium")}>
                                    {t(FOUNDATION_PLACES[step].labelKey)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
