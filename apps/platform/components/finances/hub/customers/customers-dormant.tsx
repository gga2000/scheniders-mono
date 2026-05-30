"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ZapOff, ChevronRight } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { DormantCustomer } from "@/hooks/use-finance-customers";

interface Props {
    customers: DormantCustomer[];
}

export function CustomersDormant({ customers }: Props) {
    if (customers.length === 0) {
        return (
            <SectionCard
                title="Dormant high-value customers"
                subtitle="No dormant high-value customers — everyone's recent"
                icon={ZapOff}
                accent="amber"
            >
                <div className="py-10 text-center text-sm text-muted">
                    Customers above median LTV with no order in 45+ days will appear here.
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
            title="Dormant high-value customers"
            subtitle={`${customers.length} customer${customers.length === 1 ? "" : "s"} ripe for win-back`}
            icon={ZapOff}
            accent="amber"
        >
            <div className="space-y-1.5">
                {customers.map((c, i) => {
                    const toneRing = c.risk_tone === "rose"
                        ? "border-rose-500/40 hover:bg-rose-500/5"
                        : "border-amber-500/40 hover:bg-amber-500/5";
                    const toneText = c.risk_tone === "rose"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400";
                    return (
                        <motion.div
                            key={c.phone}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.2 }}
                        >
                            <Link
                                href={`/customers/${encodeURIComponent(c.phone)}`}
                                className={cn(
                                    "block rounded-lg border bg-[var(--card-bg)] transition-colors px-3 py-2.5",
                                    toneRing
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-medium text-foreground truncate">
                                            {c.name}
                                        </div>
                                        <div className="text-[10.5px] text-muted truncate">
                                            {c.orders_count} lifetime order{c.orders_count === 1 ? "" : "s"}
                                            {c.city ? <> · {c.city}</> : null}
                                            {" · "}
                                            <span className={cn("font-semibold", toneText)}>
                                                {c.days_since_last_order}d quiet
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <FinanceValue
                                            value={c.revenue}
                                            abbreviate
                                            className="text-[13px] font-bold text-foreground tabular-nums"
                                        />
                                        <div className="text-[10px] text-muted">LTV</div>
                                    </div>
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
