"use client";

import { useLanguage } from "@/hooks/use-language";
import { Settings, Package, XCircle, MessageSquare, BellRing } from "lucide-react";
import { OrderReasonsManager } from "@/components/settings/order-reasons-manager";
import { DeliveryFeesForm } from "@/components/settings/delivery-fees-form";
import { WorkflowSettingsForm } from "@/components/settings/workflow-settings-form";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { MessageTemplatesList } from "@/components/settings/message-templates-list";


export function OrderSettings() {
    const { t } = useLanguage();
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.orders.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.orders.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Order Reasons - spans 2 cols so the tabbed editor breathes */}
                <div className="pastel-card p-6 md:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-pink)] flex items-center justify-center">
                            <XCircle className="h-4 w-4 text-rose-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.reasons")}</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">{t("settings.orders.reasonsHint")}</p>
                    <OrderReasonsManager />
                </div>

                {/* Delivery Fees - Takes up 1 column */}
                <div className="pastel-card p-6 md:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-mint)] flex items-center justify-center">
                            <Package className="h-4 w-4 text-teal-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.fees")}</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">{t("settings.orders.feesHint")}</p>
                    <DeliveryFeesForm />
                </div>

                {/* Workflow Rules - Takes up 1 column (or spans if needed) */}
                <div className="pastel-card p-6 md:col-span-1 lg:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <Settings className="h-4 w-4 text-gray-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.workflow")}</h3>
                    </div>
                    <WorkflowSettingsForm />
                </div>

                {/* Automatic WhatsApp reminder */}
                <div className="pastel-card p-6 md:col-span-2 lg:col-span-3">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-yellow)] flex items-center justify-center">
                            <BellRing className="h-4 w-4 text-amber-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.reminder")}</h3>
                    </div>
                    <ReminderSettingsForm />
                </div>

                {/* Message Templates - Spans 2 cols on LG */}
                <div className="pastel-card p-6 md:col-span-2 lg:col-span-3">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                            <MessageSquare className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.templates")}</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">{t("settings.orders.templatesHint")}</p>
                    <MessageTemplatesList />
                </div>
            </div>
        </div>
    );
}

