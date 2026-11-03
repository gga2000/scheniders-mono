"use client";

import { useLanguage } from "@/hooks/use-language";

/** «برايم متصل · فرع الكوت» in the desk header: the run goes to Prime through the API. */
export function PrimeConnectedPill({ branchName }: { branchName: string | null }) {
    const { t } = useLanguage();
    return (
        <span className="inline-flex h-9 items-center gap-2 rounded-full border border-[#DCE4F2] bg-[#E8EEF8] px-3.5 text-[13px] font-semibold text-[#1F3F75] dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#1F7A4D] shadow-[0_0_0_3px_rgba(31,122,77,0.18)]" />
            {t("printing.prime.connected", { branch: branchName ?? t("orders.prime.stop.branch") })}
        </span>
    );
}
