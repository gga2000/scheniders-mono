"use client";

import { motion } from "framer-motion";
import { Users, Star, Banknote, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";

interface StatCard {
  label: string;
  sublabel: string;
  value: string | number;
  trend?: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  borderAccent: string;
}

interface CustomerStatsStripProps {
  totalCustomers: number;
  vipCustomers: number;
  totalRevenue: number;
  atRiskCustomers: number;
  trendTotal?: number;
  trendVip?: number;
  trendRevenue?: number;
  trendAtRisk?: number;
}

function formatIQD(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}م د.ع`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}ك د.ع`;
  return `${amount.toLocaleString()} د.ع`;
}

function TrendBadge({ trend }: { trend: number }) {
  const up = trend >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium",
      up ? "text-emerald-600" : "text-red-500"
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(trend)}%
    </span>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.07, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

export function CustomerStatsStrip({
  totalCustomers,
  vipCustomers,
  totalRevenue,
  atRiskCustomers,
  trendTotal,
  trendVip,
  trendRevenue,
  trendAtRisk,
}: CustomerStatsStripProps) {
  const { t } = useLanguage();

  const CARD_CONFIGS = [
    {
      label: t("customers.stats.total"),
      sublabel: t("customers.stats.totalSub"),
      icon: Users,
      pastelClass: "pastel-card-blue",
      iconBg: "bg-[var(--pastel-blue)]/40",
      iconColor: "text-blue-700",
      valueColor: "text-foreground",
    },
    {
      label: t("customers.stats.vip"),
      sublabel: t("customers.stats.vipSub"),
      icon: Star,
      pastelClass: "pastel-card-yellow",
      iconBg: "bg-[var(--pastel-yellow)]/40",
      iconColor: "text-amber-700",
      valueColor: "text-foreground",
    },
    {
      label: t("customers.stats.revenue"),
      sublabel: t("customers.stats.revenueSub"),
      icon: Banknote,
      pastelClass: "pastel-card-green",
      iconBg: "bg-[var(--pastel-green)]/40",
      iconColor: "text-green-700",
      valueColor: "text-foreground",
    },
    {
      label: t("customers.stats.atRisk"),
      sublabel: t("customers.stats.atRiskSub"),
      icon: AlertTriangle,
      pastelClass: "pastel-card-pink",
      iconBg: "bg-[var(--pastel-pink)]/40",
      iconColor: "text-rose-700",
      valueColor: "text-foreground",
    },
  ];
  const values = [
    totalCustomers.toLocaleString("ar-IQ"),
    vipCustomers.toLocaleString("ar-IQ"),
    formatIQD(totalRevenue),
    atRiskCustomers.toLocaleString("ar-IQ"),
  ];
  const trends = [trendTotal, trendVip, trendRevenue, trendAtRisk];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARD_CONFIGS.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className={cn("pastel-card p-5 cursor-default", card.pastelClass)}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className={cn("rounded-xl p-2.5 shrink-0", card.iconBg)}>
                <Icon className={cn("h-5 w-5", card.iconColor)} />
              </div>
            </div>

            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {card.label}
              </p>
              <p className={cn("text-3xl font-bold tabular-nums leading-tight", card.valueColor)}>
                {values[i]}
              </p>
              <p className="text-xs text-muted">{card.sublabel}</p>
            </div>

            {trends[i] !== undefined && (
              <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
                <TrendBadge trend={trends[i]!} />
                <span className="text-xs text-muted">{t("customers.stats.vsLastMonth")}</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
