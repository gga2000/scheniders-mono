"use client";

import { useLanguage } from "@/hooks/use-language";
import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Save, Printer } from "lucide-react";

export function PrintingSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const { t } = useLanguage();
    const [printSettings, setPrintSettings] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings.print_settings) setPrintSettings(settings.print_settings);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        await updateSetting("print_settings", printSettings);
        setIsSaving(false);
    };

    if (loading) return <div className="text-muted">{t("common.loading")}</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.print.title")}</h2>
                <p className="text-muted">{t("settings.print.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-purple)] flex items-center justify-center">
                            <Printer className="h-4 w-4 text-purple-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.print.label")}</h3>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t("settings.print.size")}</label>
                            <select
                                className="flex h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                                value={printSettings.label_size || "4x6"}
                                onChange={(e) => setPrintSettings({ ...printSettings, label_size: e.target.value })}
                            >
                                <option value="4x6">{t("settings.print.thermal")}</option>
                                <option value="a4">{t("settings.print.a4")}</option>
                            </select>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-[var(--card-border)]">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">{t("settings.print.showPrice")}</label>
                                <button
                                    onClick={() => setPrintSettings({ ...printSettings, show_price: !printSettings.show_price })}
                                    className={`w-12 h-6 rounded-full transition-all ${printSettings.show_price !== false ? 'bg-[var(--button-success)]' : 'bg-gray-300'}`}
                                >
                                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${printSettings.show_price !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">{t("settings.print.showPhone")}</label>
                                <button
                                    onClick={() => setPrintSettings({ ...printSettings, show_phone: !printSettings.show_phone })}
                                    className={`w-12 h-6 rounded-full transition-all ${printSettings.show_phone !== false ? 'bg-[var(--button-success)]' : 'bg-gray-300'}`}
                                >
                                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${printSettings.show_phone !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-yellow)] flex items-center justify-center text-amber-700 text-xs font-bold">B</div>
                        <h3 className="text-lg font-semibold text-foreground">{t("settings.print.batching")}</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t("settings.print.grouping")}</label>
                            <p className="text-xs text-muted">{t("settings.print.groupingHint")}</p>
                            <select
                                className="flex h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                                value={printSettings.batch_grouping || "city"}
                                onChange={(e) => setPrintSettings({ ...printSettings, batch_grouping: e.target.value })}
                            >
                                <option value="city">{t("settings.print.byCity")}</option>
                                <option value="all">{t("settings.print.single")}</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] h-10 px-4 py-2 shadow-sm"
                        >
                            {isSaving ? t("common.saving") : <><Save className="h-4 w-4 mr-2" /> {t("settings.print.save")}</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

