"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronRight, CircleCheck, type LucideIcon } from "lucide-react";
import { planName } from "@scheniders/shared/plans";
import { useAuth } from "@/components/auth/auth-provider";
import { feesAtAGlance, governorateFees, useStoreShipping } from "@/components/settings/delivery-fees-summary";
import { SETTINGS_SECTION_ICONS } from "@/components/settings/settings-icons";
import { useBillingLock } from "@/hooks/use-billing-lock";
import { useLanguage } from "@/hooks/use-language";
import { useReminderSettings } from "@/hooks/use-reminder-settings";
import { useSettingsAttention, useStoreSnapshot } from "@/hooks/use-settings-attention";
import { readSetting, useSettings } from "@/hooks/use-settings";
import { useTenant } from "@/hooks/use-tenant";
import { settingsHref, type SettingsSectionId } from "@/lib/settings-sections";
import type { SettingsAttentionItem } from "@/lib/settings-attention";
import { supabase } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";

function useActiveMemberCount() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["tenant", tenantId, "member-count"],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<number> => {
            const { count, error } = await supabase
                .from("tenant_members")
                .select("user_id", { count: "exact", head: true })
                .eq("tenant_id", tenantId!)
                .eq("status", "active");
            if (error) throw error;
            return count ?? 0;
        },
    });
}

function trialDaysLeft(trialEndsAt: string | null): number | null {
    if (!trialEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000));
}

const hour = (h: number) => `${String(h === 24 ? 0 : h).padStart(2, "0")}:00`;

/**
 * Settings › Overview: what needs the shop now (each with the button that
 * fixes it), then the shop's real values, one row per section worth checking.
 */
export function SettingsOverview() {
    const { t, language } = useLanguage();
    const attention = useSettingsAttention();
    const { data: tenant } = useTenant();
    const { data: lock } = useBillingLock();
    const { data: snapshot } = useStoreSnapshot();
    const { data: shipping, isLoading: shippingLoading } = useStoreShipping();
    const { settings, get, loaded: settingsLoaded } = useSettings();
    const { settings: reminder } = useReminderSettings();
    const { data: memberCount } = useActiveMemberCount();

    const sep = " · ";

    const storeLine = snapshot
        ? [
              snapshot.logoUrl ? t("settings.overview.store.logoYes") : t("settings.overview.store.logoNo"),
              snapshot.whatsappNumber
                  ? t("settings.overview.store.whatsapp", { number: snapshot.whatsappNumber })
                  : t("settings.overview.store.whatsappNone"),
              snapshot.city,
          ].filter(Boolean).join(sep)
        : null;

    const days = tenant?.status === "trial" ? trialDaysLeft(tenant.trial_ends_at) : null;
    const planLine = tenant
        ? [
              t("settings.biz.planName", { plan: planName(tenant.plan, language) }),
              days !== null ? t("settings.biz.trialLeft", { count: days }) : t(`settings.biz.status.${tenant.status}`, tenant.status),
              lock?.balance_iqd != null ? t("settings.overview.balance", { amount: formatIQD(lock.balance_iqd) }) : null,
          ].filter(Boolean).join(sep)
        : null;
    const planOk = !!tenant && !!lock && !lock.locked && !attention.some((a) => a.kind === "wallet");

    let feesLine: string | null = null;
    if (!shippingLoading) {
        const glance = feesAtAGlance(governorateFees(shipping ?? null));
        const fee = (iqd: number) => (iqd === 0 ? t("settings.fees.free") : formatIQD(iqd));
        if (glance.otherMin === glance.otherMax && glance.otherMin === glance.baghdad) {
            feesLine = glance.baghdad === 0
                ? t("settings.overview.fees.allFree")
                : t("settings.overview.fees.same", { fee: formatIQD(glance.baghdad) });
        } else {
            const others = glance.otherMin === glance.otherMax
                ? fee(glance.otherMin)
                : t("settings.overview.fees.range", { min: fee(glance.otherMin), max: fee(glance.otherMax) });
            feesLine = t("settings.overview.fees.split", { baghdad: fee(glance.baghdad), others });
        }
    }

    const print = readSetting(settings, "print_settings");
    const labelLine = settingsLoaded
        ? [
              print.fragile_warning ? t("settings.overview.label.fragileOn") : t("settings.overview.label.fragileOff"),
              print.perfume_warning ? t("settings.overview.label.perfumeOn") : t("settings.overview.label.perfumeOff"),
          ].join(sep)
        : null;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.overview")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.overview.subtitle")}</p>
            </div>

            <section className="pastel-card p-2" aria-labelledby="settings-attention">
                <h3 id="settings-attention" className="flex items-center gap-2 px-4 pb-1 pt-3 text-sm font-semibold text-foreground">
                    {t("settings.overview.attention")}
                    {attention.length > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                            {attention.length}
                        </span>
                    )}
                </h3>
                {attention.length === 0 ? (
                    <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <CircleCheck className="h-4 w-4 text-green-700" />
                        <bdi>{t("settings.overview.allGood")}</bdi>
                    </p>
                ) : (
                    <div className="divide-y divide-(--card-border)">
                        {attention.map((item) => <AttentionRow key={item.kind} item={item} />)}
                    </div>
                )}
            </section>

            <section className="pastel-card p-2" aria-labelledby="settings-today">
                <h3 id="settings-today" className="px-4 pb-1 pt-3 text-sm font-semibold text-foreground">
                    {t("settings.overview.today")}
                </h3>
                <div className="divide-y divide-(--card-border)">
                <StatusRow section="business" title={t("settings.nav.storeInfo")} ok={!!snapshot?.whatsappNumber} value={storeLine} />
                <StatusRow section="billing" title={t("settings.nav.subscription")} ok={planOk} value={planLine} />
                <StatusRow
                    section="waseet"
                    title={t("settings.nav.waseet")}
                    value={settingsLoaded
                        ? get("waseet_sync_enabled") === true ? t("settings.overview.waseet.syncOn") : t("settings.overview.waseet.syncOff")
                        : null}
                />
                <StatusRow
                    section="team"
                    title={t("settings.nav.teamAccess")}
                    value={memberCount === undefined ? null : t("settings.overview.team.count", { count: memberCount })}
                />
                <StatusRow section="delivery-fees" title={t("settings.orders.fees")} value={feesLine} />
                <StatusRow
                    section="messages"
                    focus="reminder"
                    title={t("settings.orders.reminder")}
                    value={reminder
                        ? reminder.enabled
                            ? t("settings.overview.reminder.on", { start: hour(reminder.window.start_hour), end: hour(reminder.window.end_hour) })
                            : t("settings.overview.reminder.off")
                        : null}
                />
                <StatusRow section="label" title={t("settings.print.label")} value={labelLine} />
                </div>
            </section>
        </div>
    );
}

function AttentionRow({ item }: { item: SettingsAttentionItem }) {
    const { t } = useLanguage();
    let title: string;
    let detail: ReactNode;
    let action: string;
    let href: string;
    switch (item.kind) {
        case "wallet":
            title = t("billing.wallet.title");
            detail = item.runway.kind === "empty"
                ? t("settings.overview.wallet.empty")
                : t("settings.overview.wallet.low", { amount: formatIQD(item.balanceIqd), count: item.runway.days });
            action = t("settings.overview.wallet.action");
            href = settingsHref("billing", "wallet", { pay: "1" });
            break;
        case "staff-alerts":
            title = t("settings.nav.staffAlerts");
            detail = t("settings.overview.staff.desc");
            action = t("settings.overview.staff.action");
            href = settingsHref("staff-alerts", "staff-alerts");
            break;
        case "whatsapp":
            title = t("settings.biz.whatsapp");
            detail = t("settings.overview.whatsapp.desc");
            action = t("settings.overview.whatsapp.action");
            href = settingsHref("business", "store-whatsapp");
            break;
    }
    return (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--pastel-yellow)">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground"><bdi>{detail}</bdi></p>
            </div>
            <Link
                href={href}
                className="inline-flex h-8 shrink-0 items-center rounded-lg bg-(--ink) px-3 text-xs font-semibold text-white hover:opacity-90"
            >
                {action}
            </Link>
        </div>
    );
}

function StatusRow({
    section,
    focus,
    title,
    value,
    ok = false,
}: {
    section: SettingsSectionId;
    focus?: string;
    title: string;
    /** null while loading. */
    value: string | null;
    /** A check only where a rule backs it; other rows show their section's icon. */
    ok?: boolean;
}) {
    const Icon: LucideIcon = ok ? Check : SETTINGS_SECTION_ICONS[section];
    return (
        <Link
            href={settingsHref(section, focus)}
            className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-(--background-soft)"
        >
            <span
                className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    ok ? "bg-(--pastel-green)" : "bg-(--background)",
                )}
            >
                <Icon className={cn("h-4 w-4", ok ? "text-green-700" : "text-muted-foreground")} />
            </span>
            <span className="w-40 shrink-0 text-sm font-semibold text-foreground">{title}</span>
            {value === null ? (
                <span className="h-3 w-48 animate-pulse rounded bg-(--background)" />
            ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground"><bdi>{value}</bdi></span>
            )}
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
    );
}
