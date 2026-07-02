"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { VALUE_META, RISK_META, type ValueTier, type RiskLevel } from "@/lib/customer-reliability";

export type ValueFilter = ValueTier | "all";
export type RiskFilter = RiskLevel | "all";

const VALUE_ORDER: ValueTier[] = ["vip", "good", "newcomer"];
// Clean is the default/healthy state — only the actionable risks are filter chips.
const RISK_ORDER: RiskLevel[] = ["caution", "high", "blocked"];

type Stats = {
    val_vip: number; val_good: number; val_newcomer: number;
    risk_clean: number; risk_caution: number; risk_high: number; risk_blocked: number;
};

export function valueCounts(s: Stats): Record<ValueTier, number> {
    return { vip: s.val_vip, good: s.val_good, newcomer: s.val_newcomer };
}
export function riskCounts(s: Stats): Record<RiskLevel, number> {
    return { clean: s.risk_clean, caution: s.risk_caution, high: s.risk_high, blocked: s.risk_blocked };
}

function Chip({
    active, label, count, dot, onClick,
}: { active: boolean; label: string; count: number; dot?: string; onClick: () => void }) {
    return (
        <motion.button
            onClick={onClick}
            whileTap={{ scale: 0.96 }}
            className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
                active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-(--card-bg) text-foreground border-(--card-border) hover:bg-black/2"
            }`}
        >
            {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
            {label}
            <span className={`font-mono text-xs tabular-nums ${active ? "text-background/70" : "text-muted-foreground"}`}>
                {count.toLocaleString("en-US")}
            </span>
        </motion.button>
    );
}

/**
 * Two-axis filter chips: a VALUE group (VIP / Good / Newcomer) and a RISK group
 * (Caution / High / Blocked). Each axis filters independently and server-side.
 */
export function CustomerFilterChips({
    value, risk, total, vCounts, rCounts, onValue, onRisk,
}: {
    value: ValueFilter;
    risk: RiskFilter;
    total: number;
    vCounts: Partial<Record<ValueTier, number>>;
    rCounts: Partial<Record<RiskLevel, number>>;
    onValue: (next: ValueFilter) => void;
    onRisk: (next: RiskFilter) => void;
}) {
    const { t } = useLanguage();

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Chip active={value === "all"} label={t("customers.all")} count={total} onClick={() => onValue("all")} />
            {VALUE_ORDER.map((v) => (
                <Chip
                    key={v}
                    active={value === v}
                    label={t(`customers.value.${v}`, VALUE_META[v].label)}
                    count={vCounts[v] ?? 0}
                    dot={VALUE_META[v].dot}
                    onClick={() => onValue(value === v ? "all" : v)}
                />
            ))}

            <span className="w-px h-6 bg-(--card-border) mx-1" />

            {RISK_ORDER.filter((r) => (rCounts[r] ?? 0) > 0 || risk === r).map((r) => (
                <Chip
                    key={r}
                    active={risk === r}
                    label={t(`customers.risk.${r}`, RISK_META[r].label)}
                    count={rCounts[r] ?? 0}
                    dot={RISK_META[r].dot}
                    onClick={() => onRisk(risk === r ? "all" : r)}
                />
            ))}
        </div>
    );
}
