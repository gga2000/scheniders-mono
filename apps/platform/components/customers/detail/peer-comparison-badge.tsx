"use client";

import { motion } from "framer-motion";
import { useCustomerPercentile } from "@/hooks/use-customer-trust";
import { useLanguage } from "@/hooks/use-language";

interface PeerComparisonBadgeProps {
    phone: string;
    city: string | null;
}

export function PeerComparisonBadge({ phone, city }: PeerComparisonBadgeProps) {
    const { t } = useLanguage();
    const { data, isLoading } = useCustomerPercentile(phone);

    if (!city || isLoading || !data) return null;

    const percentile = data.percentile;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            dir="ltr"
            className="inline-flex items-center bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 rounded-full px-3 py-1 text-xs font-medium"
        >
            <bdi>
                {t("customers.trust.percentile", {
                    percent: percentile.toLocaleString("en-US"),
                    city,
                })}
            </bdi>
        </motion.div>
    );
}
