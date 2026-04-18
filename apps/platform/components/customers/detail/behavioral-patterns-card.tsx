"use client";

import { BrainCircuit, Clock, CreditCard, Package } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

// i18n keys used below — add these to your i18n.ts translations:
//   "customers.behavioral.title"            → "Behavioral Patterns"
//   "customers.behavioral.deliveryTime"     → "Preferred Delivery Time"
//   "customers.behavioral.paymentMethod"    → "Payment Method"
//   "customers.behavioral.packagePref"      → "Package Preference"

interface BehavioralPatternsCardProps {
    deliveryTimeNote?: string;
    paymentMethodNote?: string;
    packagePreferenceNote?: string;
}

export function BehavioralPatternsCard({
    deliveryTimeNote = "Evenings (6 PM - 9 PM). Usually available on weekends.",
    paymentMethodNote = "80% Cash on Delivery, 20% ZainCash.",
    packagePreferenceNote = "Always inspects upon delivery. Prefers discreet packaging.",
}: BehavioralPatternsCardProps) {
    const { t } = useLanguage();

    return (
        <div
            className={[
                "bg-(--card-bg)",
                "rounded-[3rem]",
                "p-8",
                "border border-(--card-border)",
                "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
            ].join(" ")}
        >
            {/* Card title */}
            <div className="flex items-center gap-2.5 mb-8">
                <BrainCircuit className="w-5 h-5 text-purple-500 shrink-0" />
                <h3 className="font-headline font-extrabold text-lg leading-none">
                    {t("customers.behavioral.title")}
                </h3>
            </div>

            {/* Pattern items */}
            <div className="space-y-8">
                {/* 1 — Preferred Delivery Time */}
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                        <Clock className="w-4.5 h-4.5" />
                    </div>
                    <div>
                        <p className="font-bold text-sm leading-snug">
                            {t("customers.behavioral.deliveryTime")}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {deliveryTimeNote}
                        </p>
                    </div>
                </div>

                {/* 2 — Payment Method */}
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4.5 h-4.5" />
                    </div>
                    <div>
                        <p className="font-bold text-sm leading-snug">
                            {t("customers.behavioral.paymentMethod")}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {paymentMethodNote}
                        </p>
                    </div>
                </div>

                {/* 3 — Package Preference */}
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-50 text-green-500 flex items-center justify-center shrink-0">
                        <Package className="w-4.5 h-4.5" />
                    </div>
                    <div>
                        <p className="font-bold text-sm leading-snug">
                            {t("customers.behavioral.packagePref")}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {packagePreferenceNote}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
