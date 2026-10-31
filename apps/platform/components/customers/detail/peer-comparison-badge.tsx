"use client";

import { motion } from "framer-motion";
import { useCustomerPercentile } from "@/hooks/use-customer-trust";
import { useLanguage } from "@/hooks/use-language";

interface PeerComparisonBadgeProps {
    phone: string;
}

export function PeerComparisonBadge({ phone }: PeerComparisonBadgeProps) {
    const { t } = useLanguage();
    const { data, isLoading } = useCustomerPercentile(phone);

    // The RPC pools rated customers by preferred city (5+ rated) or else the
    // whole store ("all"). A small pool is no comparison, and the green badge
    // is praise, so it only shows for the upper half; the score says the rest.
    if (isLoading || !data || data.total_in_group < 5 || !data.city_name || data.percentile < 50) return null;

    const percentile = data.percentile;
    const wholeStore = data.city_name === "all";

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 rounded-full px-3 py-1 text-xs font-medium"
        >
            <bdi>
                {wholeStore
                    ? t("customers.trust.percentileAll", { percent: percentile.toLocaleString("en-US") })
                    : t("customers.trust.percentile", {
                          percent: percentile.toLocaleString("en-US"),
                          city: data.city_name,
                      })}
            </bdi>
        </motion.div>
    );
}
