"use client";

import { useSettings } from "@/hooks/use-settings";
import { useEffect, useState } from "react";
import { Save, Store, Bell, Boxes, Volume2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { AccountLinkingCard } from "@/components/settings/account-linking-card";
import { GuideSettingsCard } from "@/components/settings/guide-settings-card";
import { SOUND_URLS } from "@/lib/notification-chime";

const NOTIFICATION_SOUND_TESTS = [
    { key: "newOrder", url: SOUND_URLS.newOrder, fallback: "New order" },
    { key: "orderChange", url: SOUND_URLS.orderChange, fallback: "Order changed" },
    { key: "orderConfirmed", url: SOUND_URLS.orderConfirmed, fallback: "Order confirmed" },
    { key: "orderCancelled", url: SOUND_URLS.orderCancelled, fallback: "Order cancelled" },
    { key: "message", url: SOUND_URLS.message, fallback: "Chat message" },
    { key: "other", url: SOUND_URLS.other, fallback: "Other notifications" },
] as const;

function previewSound(url: string): void {
    const audio = new Audio(url);
    // A click is a user gesture, so play() is allowed; a failure here is the file
    // missing, which the network tab already shows.
    void audio.play().catch(() => {});
}


export function GeneralSettings() {
    const { settings, updateSetting, loading } = useSettings();
    const [profile, setProfile] = useState<any>({});
    const [inventory, setInventory] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);
    const [notifications, setNotifications] = useState<any>({});
    const { t } = useLanguage();

    useEffect(() => {
        if (settings.store_profile) setProfile(settings.store_profile);
        if (settings.inventory_rules) setInventory(settings.inventory_rules);
        if (settings.notification_settings) setNotifications(settings.notification_settings);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        const results = await Promise.all([
            updateSetting("store_profile", profile),
            updateSetting("inventory_rules", inventory),
            updateSetting("notification_settings", notifications)
        ]);

        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            toast.error(t("toast.saveFailed") || "Failed to save settings", failed.map(r => r.error).join(", "));
        } else {
            toast.success(t("toast.settingsSaved") || "Settings saved successfully");
        }
        setIsSaving(false);
    };

    if (loading) return <div className="text-muted">{t("settings.general.loading")}</div>;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.general.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.general.subtitle")}</p>
            </div>

            {/* Top row: Store Profile + Inventory Rules side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Store Profile */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-purple) flex items-center justify-center">
                            <Store className="h-4 w-4 text-purple-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.general.storeProfile")}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t("settings.general.storeName")}
                            </label>
                            <input
                                className="flex h-9 w-full rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-green) focus:border-transparent"
                                value={profile.name || ''}
                                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {t("settings.general.currencySymbol")}
                                </label>
                                <input
                                    className="flex h-9 w-full rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-green) focus:border-transparent"
                                    value={profile.currency || ''}
                                    onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {t("settings.general.timezone")}
                                </label>
                                <input
                                    className="flex h-9 w-full rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-green) focus:border-transparent"
                                    value={profile.timezone || ''}
                                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-(--button-success) text-white hover:bg-(--button-success-hover) h-9 px-4 shadow-sm w-full"
                        >
                            {isSaving ? t("settings.general.saving") : <><Save className="mr-2 h-4 w-4" /> {t("settings.general.saveChanges")}</>}
                        </button>
                    </div>
                </div>

                {/* Inventory Rules */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                            <Boxes className="h-4 w-4 text-amber-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.general.inventoryRules")}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t("settings.general.lowStockThreshold")}
                            </label>
                            <p className="text-xs text-muted-foreground">{t("settings.general.lowStockDesc")}</p>
                            <input
                                type="number"
                                className="flex h-9 w-32 rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-green) focus:border-transparent"
                                value={inventory.low_stock_threshold || 5}
                                onChange={(e) => setInventory({ ...inventory, low_stock_threshold: Number(e.target.value) })}
                            />
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-(--button-success) text-white hover:bg-(--button-success-hover) h-9 px-4 shadow-sm w-full mt-auto"
                        >
                            {isSaving ? t("settings.general.saving") : <><Save className="mr-2 h-4 w-4" /> {t("settings.general.saveChanges")}</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Notifications — full width */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-pink) flex items-center justify-center">
                        <Bell className="h-4 w-4 text-rose-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{t("settings.general.notifications")}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Sound test */}
                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">{t("settings.general.testSounds", "Notification sounds")}</p>
                            <p className="text-xs text-muted-foreground">{t("settings.general.testSoundsDesc", "Press a button to hear it. Which groups make sound is set in notification preferences.")}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {NOTIFICATION_SOUND_TESTS.map(({ key, url, fallback }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => previewSound(url)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-(--card-border) bg-background px-3 h-9 text-sm font-medium text-foreground hover:bg-(--pastel-pink) hover:text-rose-700 transition-colors"
                                >
                                    <Volume2 className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{t(`settings.general.sound.${key}`, fallback)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Toast Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">{t("settings.general.toastPopups")}</p>
                                <p className="text-xs text-muted-foreground">{t("settings.general.toastPopupsDesc")}</p>
                            </div>
                            <button
                                onClick={() => setNotifications({ ...notifications, toast_enabled: !notifications.toast_enabled })}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${notifications.toast_enabled ? 'bg-(--button-success)' : 'bg-gray-200'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${notifications.toast_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-5 pt-4 border-t border-(--card-border)">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-(--button-success) text-white hover:bg-(--button-success-hover) h-9 px-4 shadow-sm"
                    >
                        {isSaving ? t("settings.general.saving") : <><Save className="mr-2 h-4 w-4" /> {t("settings.general.saveChanges")}</>}
                    </button>
                </div>
            </div>

            <GuideSettingsCard />

            <AccountLinkingCard />
        </div>
    );
}
