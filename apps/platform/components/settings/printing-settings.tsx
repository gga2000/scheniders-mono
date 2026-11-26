"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { SettingsPreviewPane, SettingsWithPreview } from "@/components/settings/settings-preview";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { readSetting, useSettings, type SettingValue } from "@/hooks/use-settings";
import { toast } from "@/hooks/use-toast";
import { SETTINGS_SAMPLE_ORDER } from "@/lib/settings-sample-order";
import { LABEL_PREVIEW_PX, shippingLabelsDocument, type LabelBrand } from "@/lib/shipping-labels";
import { cn } from "@/lib/utils";

/**
 * The two shipping-label lines a shop can switch on. They are the only print
 * settings the label reads (useLabelBrand); size, phone, price and batch
 * grouping used to sit here but printing never read them.
 */
export function PrintingSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const { t } = useLanguage();
    const prime = usePrimeConnection();
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
    const noOpen = printSettings.no_open_warning === true;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.print.label")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.print.subtitle")}</p>
            </div>

            <SettingsWithPreview
                preview={
                    <SettingsPreviewPane
                        title={t("settings.preview.courier")}
                        hint={t("settings.preview.live")}
                        caption={t("settings.preview.labelCaption")}
                    >
                        <LabelPreview brand={{ primeLogo: prime.connected, fragileWarning: fragile, noOpenWarning: noOpen }} />
                    </SettingsPreviewPane>
                }
            >
                <div className="pastel-card p-2">
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
                        id="print-no-open-warning"
                        focus="label-no-open"
                        label={t("settings.print.noOpenWarning")}
                        hint={t("settings.print.noOpenWarningHint")}
                        checked={noOpen}
                        onToggle={() => setPrintSettings({ ...printSettings, no_open_warning: !noOpen })}
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
            </SettingsWithPreview>
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
                        "absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        checked ? "translate-x-6" : "translate-x-1",
                    )}
                />
            </button>
        </div>
    );
}

/** The real label for a sample order: the same document the printer and the PDF get, at 90%. */
function LabelPreview({ brand }: { brand: LabelBrand }) {
    const { t } = useLanguage();
    const scale = 0.9;
    return (
        <div
            className="relative mx-auto overflow-hidden rounded-md bg-white shadow-[0_18px_40px_-18px_rgba(40,30,10,0.35)]"
            style={{ width: LABEL_PREVIEW_PX.width * scale, height: LABEL_PREVIEW_PX.height * scale }}
        >
            <iframe
                title={t("settings.preview.labelTitle")}
                srcDoc={shippingLabelsDocument([SETTINGS_SAMPLE_ORDER], brand)}
                sandbox=""
                className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                style={{ width: LABEL_PREVIEW_PX.width, height: LABEL_PREVIEW_PX.height, transform: `scale(${scale})` }}
            />
        </div>
    );
}
