"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { PastelCard } from "./shared-pastel-components";

// Access Denied
export function TeamAccessDenied() {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <PastelCard className="p-12 text-center max-w-md" variant="pink">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white dark:bg-[#1A1A1A] flex items-center justify-center shadow-md">
                    <Lock className="w-10 h-10 text-rose-500" />
                </div>
                <h1 className="text-2xl font-bold text-[#1E1E1E] dark:text-white mb-2">{t("team.page.accessDenied")}</h1>
                <p className="text-[#6B6B6B] dark:text-gray-400 mb-6">{t("team.page.adminOnly")}</p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] font-bold hover:bg-[#2D2D2D] dark:hover:bg-gray-100 transition-colors"
                >
                    {t("team.page.backToDashboard")}
                </Link>
            </PastelCard>
        </div>
    );
}
