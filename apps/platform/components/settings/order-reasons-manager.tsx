"use client";

import { useState } from "react";
import { XCircle, PackageX, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrderReasons, useReasonUsage } from "@/hooks/use-order-reasons";
import { ReasonListEditor } from "@/components/orders/reason-list-editor";
import type { ReasonKind } from "@/lib/order-reasons";

/**
 * Settings panel for managing both cancel reasons (before shipping) and
 * reject reasons (after shipping / at delivery). Two tabs, one editor each.
 * Each reason can carry an emoji + color and tracks its own usage count so
 * the picker can surface the most-used reason first.
 */

const TABS: { kind: ReasonKind; label: string; stage: string; accent: "rose" | "orange"; icon: typeof XCircle }[] = [
    { kind: "cancel", label: "أسباب الإلغاء", stage: "قبل الشحن", accent: "rose", icon: XCircle },
    { kind: "reject", label: "أسباب الرفض", stage: "بعد الشحن", accent: "orange", icon: PackageX },
];

export function OrderReasonsManager() {
    const [active, setActive] = useState<ReasonKind>("cancel");

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                {TABS.map((tab) => {
                    const isActive = active === tab.kind;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.kind}
                            onClick={() => setActive(tab.kind)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                isActive
                                    ? tab.accent === "orange"
                                        ? "bg-orange-500 text-white shadow-sm"
                                        : "bg-rose-500 text-white shadow-sm"
                                    : "text-muted hover:text-foreground",
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span
                                className={cn(
                                    "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                                    isActive ? "bg-white/20 text-white" : "bg-[var(--card-bg)] text-muted",
                                )}
                            >
                                <Truck className="w-2.5 h-2.5" />
                                {tab.stage}
                            </span>
                        </button>
                    );
                })}
            </div>

            {TABS.map((tab) =>
                active === tab.kind ? (
                    <ReasonsTabPanel key={tab.kind} kind={tab.kind} accent={tab.accent} />
                ) : null,
            )}
        </div>
    );
}

function ReasonsTabPanel({ kind, accent }: { kind: ReasonKind; accent: "rose" | "orange" }) {
    const { reasons, isFallback, isLoading } = useOrderReasons(kind);
    const { usage } = useReasonUsage(kind);

    if (isLoading) {
        return <div className="text-sm text-muted py-6 text-center">جاري التحميل...</div>;
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">
                اسحب لإعادة الترتيب، عدّل النص مباشرة، أو أضف أسباباً جديدة. الأرقام تعرض عدد مرات الاستخدام.
            </p>
            <ReasonListEditor
                kind={kind}
                reasons={reasons}
                accent={accent}
                usage={usage}
                isFallback={isFallback}
            />
        </div>
    );
}
