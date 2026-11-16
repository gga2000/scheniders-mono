"use client";

import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

/** Shown when the signed-in account's role may not open this page (employees without money access, for example). */
export function AccessDenied() {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-in fade-in zoom-in duration-500">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center mb-6"
            >
                <ShieldAlert className="w-12 h-12 text-rose-500" />
            </motion.div>

            <h1 className="text-3xl font-bold text-foreground mb-3">{t("auth.denied.title")}</h1>
            <p className="text-muted-foreground text-lg max-w-md mb-8">
                {t("auth.denied.body")}
            </p>

            <div className="flex gap-4">
                <Link
                    href="/orders"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium shadow-lg shadow-primary/20"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t("auth.denied.back")}
                </Link>
            </div>
        </div>
    );
}
