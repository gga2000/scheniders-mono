"use client";

import { useLanguage } from "@/hooks/use-language";
import { useState } from "react";
import { Save } from "lucide-react";
import { Switch } from "@scheniders/ui/switch";
import { Label } from "@scheniders/ui/label";
import { Button } from "@scheniders/ui/button";
import { toast } from "@/hooks/use-toast";
import { useReminderSettings, type ReminderSettings } from "@/hooks/use-reminder-settings";
import { REMINDER_DELAY_HOURS } from "@/lib/qstash";
import { DEFAULT_FOLLOW_UP_WINDOW } from "@/lib/follow-up-window";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);

const selectClass =
    "h-9 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-sm text-foreground";

export function ReminderSettingsForm() {
    const { settings, isLoading, isSaving, save } = useReminderSettings();
    const { t } = useLanguage();
    // Edits live in `edited` until saved; until then the saved values show.
    const [edited, setDraft] = useState<ReminderSettings | null>(null);
    const draft: ReminderSettings = edited ?? settings ?? { enabled: true, window: DEFAULT_FOLLOW_UP_WINDOW };

    if (isLoading) return <div className="text-sm text-muted">{t("common.loading")}</div>;

    const invalid = draft.window.end_hour <= draft.window.start_hour;

    const handleSave = async () => {
        try {
            await save(draft);
            setDraft(null);
            toast.success(t("settings.reminder.saved"));
        } catch (error) {
            toast.error(t("settings.reminder.saveFailed"), error instanceof Error ? error.message : undefined);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor="reminder-enabled" className="flex flex-col gap-1">
                    <span>{t("settings.reminder.auto")}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                        {t("settings.reminder.hint", { hours: String(REMINDER_DELAY_HOURS) })}
                    </span>
                </Label>
                <Switch
                    id="reminder-enabled"
                    checked={draft.enabled}
                    onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
                />
            </div>

            {draft.enabled && (
                <div className="flex flex-wrap items-center gap-3">
                    <Label htmlFor="reminder-start">{t("settings.reminder.between")}</Label>
                    <select
                        id="reminder-start"
                        className={selectClass}
                        value={draft.window.start_hour}
                        onChange={(e) => setDraft({ ...draft, window: { ...draft.window, start_hour: Number(e.target.value) } })}
                    >
                        {START_HOURS.map((h) => (
                            <option key={h} value={h}>{pad(h)}</option>
                        ))}
                    </select>
                    <Label htmlFor="reminder-end">{t("settings.reminder.and")}</Label>
                    <select
                        id="reminder-end"
                        className={selectClass}
                        value={draft.window.end_hour}
                        onChange={(e) => setDraft({ ...draft, window: { ...draft.window, end_hour: Number(e.target.value) } })}
                    >
                        {END_HOURS.map((h) => (
                            <option key={h} value={h}>{pad(h === 24 ? 0 : h)}{h === 24 ? ` (${t("settings.reminder.midnight")})` : ""}</option>
                        ))}
                    </select>
                    {invalid && <span className="text-xs text-rose-600">{t("settings.reminder.invalid")}</span>}
                </div>
            )}

            <Button onClick={handleSave} disabled={isSaving || invalid} size="sm">
                {isSaving ? t("common.saving") : <><Save className="h-4 w-4 mr-2" /> {t("settings.reminder.save")}</>}
            </Button>
        </div>
    );
}
