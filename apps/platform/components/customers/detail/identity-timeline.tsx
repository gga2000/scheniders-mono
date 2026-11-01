"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, User, MapPin, Phone, Home } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { formatBaghdadDate } from "@/lib/customer-format";
import { useIdentityTimeline, type IdentityEvent } from "@/hooks/use-identity-timeline";

/** Entries shown before "Show all": three rows of the two-column timeline. */
const VISIBLE_EVENTS = 6;

interface IdentityTimelineProps {
    phone: string;
}

function getIcon(type: IdentityEvent["type"]) {
    switch (type) {
        case "name":
            return User;
        case "city":
            return MapPin;
        case "address":
            return Home;
        case "phone":
            return Phone;
    }
}

const LABEL_KEY: Record<IdentityEvent["type"], string> = {
    name: "customers.identity.name",
    city: "customers.identity.city",
    address: "customers.identity.address",
    phone: "customers.identity.phone",
};

function getIconColor(type: IdentityEvent["type"]): string {
    switch (type) {
        case "name":
            return "text-violet-500";
        case "city":
            return "text-emerald-500";
        case "address":
            return "text-sky-500";
        case "phone":
            return "text-amber-500";
    }
}

export function IdentityTimeline({ phone }: IdentityTimelineProps) {
    const { t, language } = useLanguage();
    const { data, isLoading } = useIdentityTimeline(phone);
    const [expanded, setExpanded] = useState(false);
    const shown = data ? (expanded ? data : data.slice(0, VISIBLE_EVENTS)) : [];
    const rows = Math.max(1, Math.ceil(shown.length / 2));

    // Nothing recorded: one line, not a full empty card.
    if (!isLoading && (!data || data.length === 0)) {
        return (
            <div className="bg-(--card-bg) rounded-2xl border border-(--card-border) px-5 h-14 flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="font-semibold text-sm text-foreground whitespace-nowrap">{t("customers.identity.title")}</span>
                <span className="text-sm text-muted-foreground" aria-hidden>·</span>
                <span className="text-sm text-muted-foreground truncate">{t("customers.identity.empty")}</span>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-(--card-bg) rounded-2xl p-6 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-6">
                <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                <h3 className="font-headline font-extrabold text-lg leading-none">
                    {t("customers.identity.title")}
                </h3>
            </div>

            {/* Body */}
            {isLoading ? (
                <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-muted/40 animate-pulse shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 rounded-full bg-muted/40 animate-pulse w-2/3" />
                                <div className="h-3 rounded-full bg-muted/30 animate-pulse w-1/4" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (data && (
                <>
                    {/* Two columns, read down the first and then the second (newest first). Each entry
                        draws the line down to the next one in its column, so the line ends at the last. */}
                    <ul
                        className="grid grid-cols-2 grid-flow-col gap-x-8 gap-y-5"
                        style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
                    >
                        {shown.map((event, i) => {
                            const Icon = getIcon(event.type);
                            const lastInColumn = i === rows - 1 || i === shown.length - 1;
                            return (
                                <motion.li
                                    key={`${event.type}-${event.value}-${event.created_at}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.35, ease: "easeOut", delay: i * 0.08 }}
                                    className="relative flex items-start gap-4 min-w-0"
                                >
                                    {!lastInColumn && <span className="absolute left-5 top-10 -bottom-5 w-px bg-muted/40" aria-hidden />}
                                    <div className="relative z-10 w-10 h-10 rounded-full bg-background border border-(--card-border) flex items-center justify-center shrink-0 shadow-sm">
                                        <Icon className={`w-4 h-4 ${getIconColor(event.type)}`} />
                                    </div>
                                    <div className="flex-1 min-w-0 pt-2">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            <bdi>{t(LABEL_KEY[event.type], { value: event.value })}</bdi>
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            <bdi>{formatBaghdadDate(event.created_at, language)}</bdi>
                                        </p>
                                    </div>
                                </motion.li>
                            );
                        })}
                    </ul>
                    {data.length > VISIBLE_EVENTS && (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            aria-expanded={expanded}
                            className="mt-4 ml-14 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                        >
                            {expanded ? t("customers.identity.showLess") : t("customers.identity.showAll", { count: data.length.toLocaleString("en-US") })}
                        </button>
                    )}
                </>
            ))}
        </motion.div>
    );
}
