"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { SettingsPreviewPane, SettingsWithPreview } from "@/components/settings/settings-preview";
import { labelBrandFromSettings, useLabelLogo } from "@/hooks/use-label-brand";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { useStoreSnapshot } from "@/hooks/use-settings-attention";
import { readSetting, useSettings, type SettingValue } from "@/hooks/use-settings";
import { toast } from "@/hooks/use-toast";
import { LABEL_NO_OPEN_TEXT, LABEL_TEXT_LIMITS } from "@/lib/dispatch-label";
import { settingsHref } from "@/lib/settings-sections";
import { SETTINGS_SAMPLE_ORDER } from "@/lib/settings-sample-order";
import { LABEL_PREVIEW_PX, shippingLabelsDocument, type LabelBrand } from "@/lib/shipping-labels";
import { cn } from "@/lib/utils";

const INPUT =
    "w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-(--ink) focus:outline-none";

/**
 * What the shipping label carries beyond the order: the tape, the "do not open"
 * box in the shop's words, its logo and its note to customers. These are the
 * only print settings the label reads (useLabelBrand).
 */
export function PrintingSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const { t } = useLanguage();
    const prime = usePrimeConnection();
    const store = useStoreSnapshot();
    const logoUrl = store.data?.logoUrl ?? null;
    const logo = useLabelLogo(logoUrl);
    // The fields as edited; null = nothing changed, so they show what is saved.
    const [draft, setDraft] = useState<SettingValue<"print_settings"> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const printSettings = draft ?? readSetting(settings, "print_settings");
    const change = (patch: Partial<SettingValue<"print_settings">>) => setDraft({ ...printSettings, ...patch });

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
    const shopLogo = printSettings.shop_logo === true;
    const brand = labelBrandFromSettings(printSettings, { primeLinked: prime.connected, shopLogo: logo.data ?? null });
    const logoHint = !logoUrl
        ? t("settings.print.shopLogoNone")
        : logo.isError
          ? t("settings.print.shopLogoUnreadable")
          : t("settings.print.shopLogoHint");

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
                        <LabelPreview brand={brand} />
                    </SettingsPreviewPane>
                }
            >
                <div className="pastel-card p-2">
                    <LabelSwitch
                        id="print-shop-logo"
                        focus="label-shop-logo"
                        label={t("settings.print.shopLogo")}
                        hint={logoHint}
                        checked={shopLogo && Boolean(logoUrl)}
                        disabled={!logoUrl}
                        onToggle={() => change({ shop_logo: !shopLogo })}
                    >
                        {!logoUrl && (
                            <Link href={settingsHref("business")} className="text-xs font-semibold text-foreground underline underline-offset-2">
                                <bdi>{t("settings.print.shopLogoAdd")}</bdi>
                            </Link>
                        )}
                    </LabelSwitch>
                    <Divider />
                    <LabelSwitch
                        id="print-fragile-warning"
                        focus="label-fragile"
                        label={t("settings.print.fragileWarning")}
                        hint={t("settings.print.fragileWarningHint")}
                        checked={fragile}
                        onToggle={() => change({ fragile_warning: !fragile })}
                    />
                    <Divider />
                    <LabelSwitch
                        id="print-no-open-warning"
                        focus="label-no-open"
                        label={t("settings.print.noOpenWarning")}
                        hint={t("settings.print.noOpenWarningHint")}
                        checked={noOpen}
                        onToggle={() => change({ no_open_warning: !noOpen })}
                    />
                    {noOpen && (
                        <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2">
                            <TextField
                                id="print-no-open-text"
                                label={t("settings.print.noOpenText")}
                                value={printSettings.no_open_text ?? ""}
                                placeholder={LABEL_NO_OPEN_TEXT}
                                maxLength={LABEL_TEXT_LIMITS.noOpenText}
                                onChange={(value) => change({ no_open_text: value })}
                            />
                            <TextField
                                id="print-no-open-subtext"
                                label={t("settings.print.noOpenSubtext")}
                                value={printSettings.no_open_subtext ?? ""}
                                placeholder={t("settings.print.noOpenSubtextPlaceholder")}
                                maxLength={LABEL_TEXT_LIMITS.noOpenSubtext}
                                onChange={(value) => change({ no_open_subtext: value })}
                            />
                        </div>
                    )}
                    <Divider />
                    <div data-setting="label-customer-note" className="space-y-2 px-4 py-3">
                        <div>
                            <label htmlFor="print-customer-note" className="text-sm font-semibold text-foreground">
                                <bdi>{t("settings.print.customerNote")}</bdi>
                            </label>
                            <p className="text-xs text-muted-foreground"><bdi>{t("settings.print.customerNoteHint")}</bdi></p>
                        </div>
                        <textarea
                            id="print-customer-note"
                            dir="rtl"
                            rows={2}
                            value={printSettings.customer_note ?? ""}
                            placeholder={t("settings.print.customerNotePlaceholder")}
                            maxLength={LABEL_TEXT_LIMITS.customerNote}
                            onChange={(e) => change({ customer_note: e.target.value })}
                            className={cn(INPUT, "resize-none leading-relaxed")}
                        />
                    </div>
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

function Divider() {
    return <div className="mx-4 border-t border-(--card-border)" />;
}

function TextField({
    id,
    label,
    value,
    placeholder,
    maxLength,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    placeholder: string;
    maxLength: number;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                <bdi>{label}</bdi>
            </label>
            <input id={id} dir="rtl" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className={INPUT} />
        </div>
    );
}

function LabelSwitch({
    id,
    focus,
    label,
    hint,
    checked,
    disabled = false,
    onToggle,
    children,
}: {
    id: string;
    focus: string;
    label: string;
    hint: string;
    checked: boolean;
    disabled?: boolean;
    onToggle: () => void;
    children?: ReactNode;
}) {
    return (
        <div data-setting={focus} className="flex items-center justify-between gap-4 rounded-xl px-4 py-3">
            <div className="min-w-0">
                <p id={id} className="text-sm font-semibold text-foreground"><bdi>{label}</bdi></p>
                <p className="text-xs text-muted-foreground"><bdi>{hint}</bdi></p>
                {children}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={id}
                disabled={disabled}
                onClick={onToggle}
                className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
