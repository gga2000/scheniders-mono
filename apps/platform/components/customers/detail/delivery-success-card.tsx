"use client";

import { motion } from "framer-motion";
import { BadgeCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface DeliverySuccessCardProps {
    successRate: number;
    monthlyData?: { month: string; rate: number }[];
}

const BAR_CONFIG = [
    { opacityClass: "opacity-10", defaultH: "h-3",  hoverH: "group-hover:h-5"  },
    { opacityClass: "opacity-20", defaultH: "h-5",  hoverH: "group-hover:h-8"  },
    { opacityClass: "opacity-40", defaultH: "h-8",  hoverH: "group-hover:h-11" },
    { opacityClass: "opacity-100",defaultH: "h-14", hoverH: "group-hover:h-14" },
    { opacityClass: "opacity-60", defaultH: "h-10", hoverH: "group-hover:h-12" },
    { opacityClass: "opacity-30", defaultH: "h-4",  hoverH: "group-hover:h-6"  },
] as const;

export function DeliverySuccessCard({ successRate }: DeliverySuccessCardProps) {
    const { t } = useLanguage();

    return (
        <div className="group bg-[#c7f8ef] rounded-[3rem] p-8 aspect-square flex flex-col justify-between hover:translate-y-[-4px] transition-all duration-300">
            {/* Top row */}
            <div className="flex items-start justify-between">
                <div>
                    <p className="font-headline font-bold text-lg mb-1 text-[#33605a]">
                        {t("customers.trust.successRate")}
                    </p>
                    <p className="text-[#33605a]/60 text-xs">Last 120 completed orders</p>
                </div>
                <BadgeCheck className="w-8 h-8 text-[#33605a] opacity-30 shrink-0" />
            </div>

            {/* Giant percentage */}
            <motion.p
                className="text-7xl font-black font-headline tabular-nums text-[#33605a] leading-none"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                {Math.round(successRate)}%
            </motion.p>

            {/* Animated bars */}
            <div className="flex items-end gap-2">
                {BAR_CONFIG.map((bar, i) => (
                    <motion.div
                        key={i}
                        className={[
                            "flex-1 rounded-full bg-[#33605a]",
                            bar.opacityClass,
                            bar.defaultH,
                            bar.hoverH,
                            "transition-all duration-500",
                        ].join(" ")}
                        initial={{ scaleY: 0, originY: 1 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: i * 0.07, duration: 0.45, ease: "easeOut" }}
                    />
                ))}
            </div>
        </div>
    );
}
