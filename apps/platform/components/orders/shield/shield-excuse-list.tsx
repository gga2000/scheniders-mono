"use client";

import { Switch } from "@scheniders/ui/switch";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";
import { useSetShieldExcused, useShieldOwnBadOrders } from "@/hooks/use-shield-excuse";

function dayLabel(iso: string, language: string): string {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        day: "numeric",
        month: "short",
        year: "numeric",
        numberingSystem: "latn",
    }).format(new Date(iso));
}

/**
 * In the Shield report: this store's orders that cost the customer points, one
 * row each, with an "our fault" switch (Ali, 2026-11-05). Turning it on means
 * the order was the store's or the courier's fault, so it no longer counts.
 * Staff without orders.edit see the list without switches.
 */
export function ShieldExcuseList({ phone, open }: { phone: string; open: boolean }) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const { can } = usePermission();
    const canEdit = can(PERMISSIONS.EDIT_ORDERS);
    const { data: rows, isLoading, isError } = useShieldOwnBadOrders(phone, open);
    const setExcused = useSetShieldExcused();

    if (isLoading || (!isError && (rows?.length ?? 0) === 0)) return null;

    const onToggle = (orderId: string, excused: boolean) =>
        setExcused.mutate(
            { orderId, excused },
            { onError: () => toast({ title: t("shield.excuse.failed"), variant: "error" }) },
        );

    return (
        <section data-shield-excuse-list className="rounded-2xl border border-(--card-border) bg-(--background)/50 px-5 py-4">
            <h3 dir={dir} className="text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("shield.excuse.title")}
            </h3>
            <p dir={dir} className="mt-1 text-left text-xs text-muted-foreground">{t("shield.excuse.sub")}</p>
            {isError ? (
                <p dir={dir} className="mt-3 text-left text-sm text-muted-foreground">{t("shield.loadFailed")}</p>
            ) : (
                <ul className="mt-3 divide-y divide-(--card-border)">
                    {(rows ?? []).map((r) => {
                        const pending = setExcused.isPending && setExcused.variables?.orderId === r.id;
                        const excused = pending ? Boolean(setExcused.variables?.excused) : r.excused;
                        return (
                            <li key={r.id} className="flex items-center gap-3 py-2.5">
                                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                                    {r.sequence_number ? `#${r.sequence_number}` : ""}
                                </span>
                                <span className="w-32 shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{dayLabel(r.created_at, language)}</span>
                                <span dir="auto" className={cn("min-w-0 flex-1 truncate text-sm text-foreground", excused && "text-muted-foreground line-through")}>
                                    {r.reason || t(`shield.excuse.status.${r.status}`)}
                                </span>
                                <span
                                    className={cn(
                                        "w-10 shrink-0 text-right font-mono text-sm font-bold tabular-nums",
                                        excused ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400",
                                    )}
                                    dir="ltr"
                                >
                                    {excused || r.points === 0 ? "0" : `−${r.points}`}
                                </span>
                                {canEdit && (
                                    <label className="flex shrink-0 cursor-pointer items-center gap-2">
                                        <span dir={dir} className="text-[12px] font-medium text-muted-foreground">{t("shield.excuse.ourFault")}</span>
                                        <Switch
                                            checked={excused}
                                            disabled={pending}
                                            onCheckedChange={(v) => onToggle(r.id, v)}
                                            aria-label={`${t("shield.excuse.ourFault")} ${r.sequence_number ? `#${r.sequence_number}` : ""}`}
                                        />
                                    </label>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
