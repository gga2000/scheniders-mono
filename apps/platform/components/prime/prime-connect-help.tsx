"use client";

import { HelpCircle } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

/** The steps under «وين ألكى هاي المعلومات؟», by which form the merchant is filling. */
const STEPS = {
    existing: ["prime.link.help.existing1", "prime.link.help.existing2", "prime.link.help.existing3"],
    new: ["prime.link.help.new1", "prime.link.help.new2", "prime.link.help.new3"],
} as const;

/** A short, folded guide to where each detail the Prime forms ask for comes from. */
export function PrimeConnectHelp({ path }: { path: keyof typeof STEPS }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <details className="group rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-left">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
                <HelpCircle className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span dir={dir}>{t("prime.link.help.title")}</span>
            </summary>
            <ol className="mt-2 grid list-decimal gap-1.5 ps-5 text-sm text-muted">
                {STEPS[path].map((step) => (
                    <li key={step} dir={dir}>
                        {t(step)}
                    </li>
                ))}
            </ol>
        </details>
    );
}
