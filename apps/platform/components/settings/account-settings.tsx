"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Database, Volume2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { SOUND_URLS } from "@/lib/notification-chime";
import { settingsHref } from "@/lib/settings-sections";
import { AccountLinkingCard } from "@/components/settings/account-linking-card";
import { GuideSettingsCard } from "@/components/settings/guide-settings-card";
import { NotificationSettingsDialog } from "@/components/layout/notification-settings-dialog";

const NOTIFICATION_SOUND_TESTS = [
    { key: "newOrder", url: SOUND_URLS.newOrder },
    { key: "orderChange", url: SOUND_URLS.orderChange },
    { key: "orderConfirmed", url: SOUND_URLS.orderConfirmed },
    { key: "orderCancelled", url: SOUND_URLS.orderCancelled },
    { key: "message", url: SOUND_URLS.message },
    { key: "other", url: SOUND_URLS.other },
] as const;

function previewSound(url: string): void {
    const audio = new Audio(url);
    // A click is a user gesture, so play() is allowed; a failure here is the file
    // missing, which the network tab already shows.
    void audio.play().catch(() => {});
}

/** Sign-in, notification sounds and choices, the setup guide, and a pointer to the Data Vault section. */
export function AccountSettings() {
    const { t } = useLanguage();
    const [prefsOpen, setPrefsOpen] = useState(false);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.account")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.account.subtitle")}</p>
            </div>

            <div data-setting="sign-in">
                <AccountLinkingCard />
            </div>

            <div className="pastel-card p-6" data-setting="sounds">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-pink)">
                            <Volume2 className="h-4 w-4 text-rose-700" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-foreground">{t("settings.general.testSounds")}</h3>
                            <p className="text-xs text-muted-foreground">{t("settings.general.testSoundsDesc")}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setPrefsOpen(true)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-(--card-border) px-3 text-sm font-semibold text-foreground hover:bg-(--background)"
                    >
                        <Bell className="h-4 w-4" />
                        {t("settings.account.notifyPrefs")}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {NOTIFICATION_SOUND_TESTS.map(({ key, url }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => previewSound(url)}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-(--card-border) bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-(--pastel-pink) hover:text-rose-700"
                        >
                            <Volume2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t(`settings.general.sound.${key}`)}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div data-setting="guide">
                <GuideSettingsCard />
            </div>

            <div className="pastel-card flex flex-wrap items-center gap-4 p-6" data-setting="backup">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-green)">
                    <Database className="h-4 w-4 text-green-700" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground">{t("settings.hub.backup.title")}</h3>
                    <p className="text-sm text-muted-foreground">{t("settings.data.vaultDesc")}</p>
                </div>
                <Link
                    href={settingsHref("vault")}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                    {t("settings.data.openVault")}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>

            <NotificationSettingsDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
        </div>
    );
}
