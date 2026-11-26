"use client";

import { BellRing, MessageSquare } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTemplateEditor } from "@/hooks/use-message-templates";
import { useStoreSnapshot } from "@/hooks/use-settings-attention";
import { MessageTemplatesList } from "@/components/settings/message-templates-list";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { SettingsPreviewPane, SettingsWithPreview } from "@/components/settings/settings-preview";
import { WhatsAppChatPreview } from "@/components/settings/whatsapp-chat-preview";

/**
 * What the shop sends customers on WhatsApp: the message templates, edited in
 * place with the customer's chat beside them, then the automatic reminder.
 */
export function WhatsAppMessagesSettings() {
    const { t } = useLanguage();
    const editor = useTemplateEditor();
    const { data: store } = useStoreSnapshot();

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.messages")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.messages.subtitle")}</p>
            </div>

            <SettingsWithPreview
                preview={
                    <SettingsPreviewPane
                        title={t("settings.preview.customer")}
                        hint={t("settings.preview.live")}
                        caption={t("settings.preview.sampleOrder")}
                    >
                        <WhatsAppChatPreview
                            content={editor.current?.content_ar || editor.current?.content || ""}
                            storeName={store?.name ?? ""}
                            emptyText={t("templates.previewEmpty")}
                        />
                    </SettingsPreviewPane>
                }
            >
                <div className="pastel-card p-6" data-setting="templates">
                    <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-green)">
                            <MessageSquare className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.orders.templates")}</h3>
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">{t("settings.orders.templatesHint")}</p>
                    <MessageTemplatesList editor={editor} />
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
            </SettingsWithPreview>
        </div>
    );
}
