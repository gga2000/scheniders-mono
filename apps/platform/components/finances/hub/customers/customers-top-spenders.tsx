"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, ChevronRight } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { CustomerSummary } from "@/hooks/use-finance-customers";

interface Props {
    customers: CustomerSummary[];
}

export function CustomersTopSpenders({ customers }: Props) {
    if (customers.length === 0) {
        return (
            <SectionCard
                title="Top Spenders"
                subtitle="No customer revenue yet"
                icon={Crown}
                accent="amber"
            >
                <div className="py-10 text-center text-sm text-muted">
                    Customers appear here as orders complete.
                </div>
            </SectionCard>
        );
    }

    const max = customers[0]?.revenue || 1;

    return (
        <SectionCard
            title="Top Spenders"
            subtitle={`Top ${customers.length} customers by lifetime revenue`}
            icon={Crown}
            accent="amber"
        >
            <div className="space-y-1.5">
                {customers.map((c, i) => {
                    const pct = (c.revenue / max) * 100;
                    return (
                        <motion.div
                            key={c.phone}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.2 }}
                        >
                            <Link
                                href={`/customers/${encodeURIComponent(c.phone)}`}
                                className="block relative rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--background)]/40 transition-colors overflow-hidden"
                            >
                                <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/15 to-transparent"
                                    style={{ width: `${pct}%` }}
                                />
                                <div className="relative flex items-center gap-3 px-3 py-2.5">
                                    <div className={cn(
                                        "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0",
                                        i === 0
                                            ? "bg-amber-500 text-white"
                                            : i < 3
                                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                                : "bg-[var(--card-border)] text-muted"
                                    )}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="text-[13px] font-medium text-foreground truncate">{c.name}</div>
                                            {c.is_repeat && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold shrink-0">
                                                    repeat
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10.5px] text-muted truncate">
                                            {c.orders_count} order{c.orders_count === 1 ? "" : "s"} · AOV{" "}
                                            <FinanceValue value={c.aov} abbreviate className="tabular-nums" />
                                            {c.city ? <> · {c.city}</> : null}
                                        </div>
                                    </div>
                                    <FinanceValue
                                        value={c.revenue}
                                        abbreviate
                                        className="text-[13px] font-bold text-foreground tabular-nums shrink-0"
                                    />
                                    <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>
        </SectionCard>
    );
}
