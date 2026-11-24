"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { readSetting, useSettings, type SettingValue } from "@/hooks/use-settings";
import { toast } from "@/hooks/use-toast";
import { LABEL_FRAGILE_TEXT, LABEL_GLASS_PREFIX, LABEL_PERFUME_TEXT } from "@/lib/dispatch-label";
import { cn } from "@/lib/utils";

/**
 * The two shipping-label lines a shop can switch on. They are the only print
 * settings the label reads (useLabelBrand); size, phone, price and batch
 * grouping used to sit here but printing never read them.
 */
export function PrintingSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const { t } = useLanguage();
    // The switches as edited; null = nothing changed, so they show what is saved.
    const [draft, setDraft] = useState<SettingValue<"print_settings"> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const printSettings = draft ?? readSetting(settings, "print_settings");
    const setPrintSettings = (next: SettingValue<"print_settings">) => setDraft(next);

    const handleSave = async () => {
        setIsSaving(true);
        const result = await updateSetting("print_settings", printSettings);
        setIsSaving(false);
        if (result.success) {
            setDraft(null);
            toast.success(t("settings.print.saved"));
        } else toast.error(t("settings.print.saveFailed"), result.error);
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading")}
            </div>
        );
    }

    const fragile = printSettings.fragile_warning === true;
    const perfume = printSettings.perfume_warning === true;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.print.label")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.print.subtitle")}</p>
            </div>

            <div className="flex flex-wrap items-start gap-4">
                <div className="pastel-card min-w-0 flex-1 basis-96 p-2">
                    <LabelSwitch
                        id="print-fragile-warning"
                        focus="label-fragile"
                        label={t("settings.print.fragileWarning")}
                        hint={t("settings.print.fragileWarningHint")}
                        checked={fragile}
                        onToggle={() => setPrintSettings({ ...printSettings, fragile_warning: !fragile })}
                    />
                    <div className="mx-4 border-t border-(--card-border)" />
                    <LabelSwitch
                        id="print-perfume-warning"
                        focus="label-perfume"
                        label={t("settings.print.perfumeWarning")}
                        hint={t("settings.print.perfumeWarningHint")}
                        checked={perfume}
                        onToggle={() => setPrintSettings({ ...printSettings, perfume_warning: !perfume })}
                    />
                    <div className="flex justify-end px-4 pb-3 pt-2">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isSaving ? t("common.saving") : t("settings.print.save")}
                        </button>
                    </div>
                </div>

                <LabelPreview fragile={fragile} perfume={perfume} />
            </div>
        </div>
    );
}

function LabelSwitch({
    id,
    focus,
    label,
    hint,
    checked,
    onToggle,
}: {
    id: string;
    focus: string;
    label: string;
    hint: string;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <div data-setting={focus} className="flex items-center justify-between gap-4 rounded-xl px-4 py-3">
            <div className="min-w-0">
                <p id={id} className="text-sm font-semibold text-foreground"><bdi>{label}</bdi></p>
                <p className="text-xs text-muted-foreground"><bdi>{hint}</bdi></p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={id}
                onClick={onToggle}
                className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    checked ? "bg-(--button-success)" : "bg-neutral-300 dark:bg-neutral-600",
                )}
            >
                <span
                    className={cn(
                        "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        checked ? "translate-x-6" : "translate-x-1",
                    )}
                />
            </button>
        </div>
    );
}

/** A drawing of the label, so the merchant sees where each line lands before printing. */
function LabelPreview({ fragile, perfume }: { fragile: boolean; perfume: boolean }) {
    return (
        <div aria-hidden className="w-60 shrink-0 space-y-2 rounded-xl border border-(--card-border) bg-white p-3 text-[11px] text-neutral-900">
            <div className="h-2 w-1/3 rounded bg-neutral-300" />
            <div className="h-1.5 rounded bg-neutral-200" />
            <div className="h-1.5 w-2/3 rounded bg-neutral-200" />
            {fragile && (
                <div className="rounded bg-neutral-900 px-2 py-1 text-center font-bold text-white">
                    <bdi>{perfume ? LABEL_GLASS_PREFIX : ""}{LABEL_FRAGILE_TEXT}</bdi>
                </div>
            )}
            {perfume && (
                <div className="rounded border border-neutral-900 px-2 py-1 text-center font-bold">
                    <bdi>{LABEL_PERFUME_TEXT}</bdi>
                </div>
            )}
            <div className="h-1.5 w-1/2 rounded bg-neutral-200" />
            <div className="ml-auto h-10 w-10 rounded-sm bg-[repeating-linear-gradient(90deg,#171717_0_3px,#fff_3px_6px)]" />
        </div>
    );
}
