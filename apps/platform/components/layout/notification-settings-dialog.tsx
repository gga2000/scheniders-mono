"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@scheniders/ui/dialog";
import { Switch } from "@scheniders/ui/switch";
import {
    useNotificationSettings,
    NOTIFICATION_CATEGORIES,
    type NotificationCategoryKey,
    type NotificationChannel,
    type DigestMode,
} from "@/hooks/use-notification-settings";
import { useNotificationPush } from "@/hooks/use-notification-push";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";
import { Monitor, BellRing, Volume2, Moon, Layers, AlertTriangle } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CHANNELS: { key: NotificationChannel; icon: typeof Monitor; labelKey: string; fallback: string }[] = [
    { key: "in_app", icon: Monitor, labelKey: "notifications.channelInApp", fallback: "In app" },
    { key: "push", icon: BellRing, labelKey: "notifications.channelPush", fallback: "Push" },
    { key: "sound", icon: Volume2, labelKey: "notifications.channelSound", fallback: "Sound" },
];

const CATEGORY_FALLBACKS: Record<NotificationCategoryKey, string> = {
    orders: "Orders",
    chat: "Mentions",
    inventory: "Inventory",
    delivery: "Delivery",
    finance: "Finance",
    customer: "Customers",
    team: "Team",
};

/** "13:45" <-> minutes from midnight, so the inputs stay plain <input type="time">. */
function toTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fromTime(value: string): number | null {
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return ((h % 24) * 60 + (m % 60) + 1440) % 1440;
}

export function NotificationSettingsDialog({ open, onOpenChange }: Props) {
    const { t } = useLanguage();
    const {
        prefs, quietHours, digestMode, ready, busy,
        setChannel, setQuietHours, setDigestMode,
    } = useNotificationSettings();
    const push = useNotificationPush();

    const digestOptions: { key: DigestMode; label: string }[] = [
        { key: "off", label: t("notifications.digestOff", "As it happens") },
        { key: "hourly", label: t("notifications.digestHourly", "Hourly summary") },
        { key: "daily", label: t("notifications.digestDaily", "Daily summary") },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("notifications.settingsTitle", "Notification settings")}</DialogTitle>
                    <DialogDescription>
                        {t("notifications.settingsDesc",
                            "Choose what reaches you, where, and when.")}
                    </DialogDescription>
                </DialogHeader>

                {/* Push can't be delivered at all in some browsers; say so rather
                    than letting someone switch on a column that does nothing. */}
                {(push.availability === "unsupported" || push.availability === "blocked") && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            {push.availability === "blocked"
                                ? t("notifications.pushBlocked",
                                    "Notifications are blocked in your browser settings")
                                : t("notifications.pushUnsupported",
                                    "This browser can't deliver push notifications")}
                        </span>
                    </div>
                )}

                {/* Category × channel */}
                <section className="mt-2">
                    <div className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("notifications.category", "Category")}
                        </span>
                        {CHANNELS.map(({ key, icon: Icon, labelKey, fallback }) => (
                            <span key={key} className="flex flex-col items-center gap-0.5 text-muted-foreground">
                                <Icon className="w-4 h-4" />
                                <span className="text-[10px] font-medium">{t(labelKey, fallback)}</span>
                            </span>
                        ))}

                        {NOTIFICATION_CATEGORIES.map((category) => (
                            <div key={category} className="contents">
                                <span className="py-2 text-sm text-foreground border-t border-[var(--card-border)]">
                                    {t(`notifications.category.${category}`, CATEGORY_FALLBACKS[category])}
                                </span>
                                {CHANNELS.map(({ key }) => (
                                    <span
                                        key={key}
                                        className="flex justify-center py-2 border-t border-[var(--card-border)]"
                                    >
                                        <Switch
                                            id={`pref-${category}-${key}`}
                                            checked={prefs[category][key]}
                                            disabled={!ready || busy}
                                            onCheckedChange={(v) => setChannel(category, key, v)}
                                        />
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Quiet hours */}
                <section className="mt-5 rounded-lg border border-[var(--card-border)] p-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Moon className="w-4 h-4 text-muted-foreground" />
                            {t("notifications.quietHours", "Quiet hours")}
                        </span>
                        <Switch
                            id="quiet-hours-enabled"
                            checked={quietHours.enabled}
                            disabled={!ready || busy}
                            onCheckedChange={(v) => setQuietHours({ enabled: v })}
                        />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t("notifications.quietHoursDesc",
                            "Push and sound stay silent in this window. The feed still fills up.")}
                    </p>
                    <div className={cn(
                        "mt-3 flex items-center gap-2",
                        !quietHours.enabled && "opacity-50 pointer-events-none",
                    )}>
                        <label htmlFor="quiet-start" className="text-xs text-muted-foreground">
                            {t("notifications.from", "From")}
                        </label>
                        <input
                            id="quiet-start"
                            type="time"
                            value={toTime(quietHours.start)}
                            disabled={!ready || busy}
                            onChange={(e) => {
                                const v = fromTime(e.target.value);
                                if (v !== null) setQuietHours({ start: v });
                            }}
                            className="rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-sm"
                        />
                        <label htmlFor="quiet-end" className="text-xs text-muted-foreground">
                            {t("notifications.to", "to")}
                        </label>
                        <input
                            id="quiet-end"
                            type="time"
                            value={toTime(quietHours.end)}
                            disabled={!ready || busy}
                            onChange={(e) => {
                                const v = fromTime(e.target.value);
                                if (v !== null) setQuietHours({ end: v });
                            }}
                            className="rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-sm"
                        />
                    </div>
                </section>

                {/* Digest */}
                <section className="mt-4 rounded-lg border border-[var(--card-border)] p-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                        {t("notifications.digest", "Delivery pace")}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t("notifications.digestDesc",
                            "Batch push into a summary instead of one alert at a time.")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {digestOptions.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setDigestMode(key)}
                                aria-pressed={digestMode === key}
                                disabled={!ready || busy}
                                className={cn(
                                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                                    digestMode === key
                                        ? "bg-foreground text-[var(--card-bg)]"
                                        : "border border-[var(--card-border)] text-muted-foreground hover:bg-muted",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </section>
            </DialogContent>
        </Dialog>
    );
}
