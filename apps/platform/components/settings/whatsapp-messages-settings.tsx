"use client";

import { BellRing, MessageSquare } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { MessageTemplatesList } from "@/components/settings/message-templates-list";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";

/** What the shop sends customers on WhatsApp: the automatic order reminder, then the saved message templates. */
export function WhatsAppMessagesSettings() {
    const { t } = useLanguage();
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.messages")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.messages.subtitle")}</p>
            </div>

            <div className="pastel-card p-6" data-setting="reminder">
                <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-yellow)">
                        <BellRing className="h-4 w-4 text-amber-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.reminder")}</h3>
                </div>
                <ReminderSettingsForm />
            </div>

            <div className="pastel-card p-6" data-setting="templates">
                <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-green)">
                        <MessageSquare className="h-4 w-4 text-green-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.templates")}</h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{t("settings.orders.templatesHint")}</p>
                <MessageTemplatesList />
            </div>
        </div>
    );
}
