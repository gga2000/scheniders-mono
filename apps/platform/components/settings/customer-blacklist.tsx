"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldBan, Plus, Trash2, Phone, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { addToBlacklist, listBlacklist, removeFromBlacklist } from "@/lib/blacklist";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { formatPhoneDisplay } from "@/lib/customer-format";

/**
 * Settings › Blacklist. Reads and writes the same `blacklist` table as the
 * Customers page, order cards and every order intake, so a number blocked
 * here is really refused everywhere.
 */
export function CustomerBlacklist() {
    const { t } = useLanguage();
    const { can } = usePermission();
    const { tenantId, profile, user } = useAuth();
    const queryClient = useQueryClient();
    const [phone, setPhone] = useState("");
    const [reason, setReason] = useState("");
    const [phoneError, setPhoneError] = useState("");

    const canBlock = can(PERMISSIONS.BLOCK_CUSTOMERS);
    const canUnblock = can(PERMISSIONS.UNBLOCK_CUSTOMERS);

    const list = useQuery({
        queryKey: ["settings-blacklist", tenantId],
        queryFn: () => listBlacklist(tenantId as string),
        enabled: !!tenantId,
    });
    const entries = list.data ?? [];

    const refresh = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: ["settings-blacklist"] }),
            queryClient.invalidateQueries({ queryKey: ["customers"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-profile"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-dialog"] }),
        ]);

    const add = useMutation({
        mutationFn: (input: { phone: string; reason: string }) =>
            addToBlacklist({
                tenantId: tenantId as string,
                phone: input.phone,
                reason: input.reason,
                addedBy: profile?.display_name || user?.email || null,
            }),
        onSuccess: async () => {
            setPhone("");
            setReason("");
            setPhoneError("");
            toast.success(t("settings.blacklist.added"));
            await refresh();
        },
        onError: (e: Error) => toast.error(t("settings.blacklist.saveFailed"), e.message),
    });

    const remove = useMutation({
        mutationFn: (p: string) => removeFromBlacklist(tenantId as string, p),
        onSuccess: async () => {
            toast.success(t("settings.blacklist.removed"));
            await refresh();
        },
        onError: (e: Error) => toast.error(t("settings.blacklist.removeFailed"), e.message),
    });

    const handleAdd = () => {
        const local = normalizePhoneForSearch(phone.trim());
        if (local.length !== 10 || !local.startsWith("7")) {
            setPhoneError(t("settings.blacklist.phoneInvalid"));
            return;
        }
        if (entries.some((e) => normalizePhoneForSearch(e.phone) === local)) {
            setPhoneError(t("settings.blacklist.phoneExists"));
            return;
        }
        if (!reason.trim()) {
            setPhoneError(t("settings.blacklist.reasonRequired"));
            return;
        }
        add.mutate({ phone: phone.trim(), reason: reason.trim() });
    };

    if (list.isLoading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.blacklist.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.blacklist.subtitle")}</p>
            </div>

            {canBlock && (
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-pink) flex items-center justify-center">
                            <ShieldBan className="h-4 w-4 text-rose-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.blacklist.add")}</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-3">
                        <div className="space-y-1.5">
                            <label htmlFor="blacklist-phone" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t("settings.blacklist.phone")}
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <input
                                    id="blacklist-phone"
                                    type="tel"
                                    placeholder="07XXXXXXXXX"
                                    value={phone}
                                    onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-pink) focus:border-transparent"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="blacklist-reason" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t("settings.blacklist.reason")}
                            </label>
                            <input
                                id="blacklist-reason"
                                type="text"
                                placeholder={t("settings.blacklist.reasonPh")}
                                value={reason}
                                onChange={(e) => { setReason(e.target.value); setPhoneError(""); }}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                className="w-full h-9 px-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-pink) focus:border-transparent"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleAdd}
                                disabled={add.isPending}
                                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
                            >
                                <Plus className="h-4 w-4" />
                                {t("settings.blacklist.addBtn")}
                            </button>
                        </div>
                    </div>

                    {phoneError && (
                        <p className="flex items-center gap-1.5 mt-2 text-xs text-rose-600">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {phoneError}
                        </p>
                    )}
                </div>
            )}

            <div className="pastel-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground">
                        {t("settings.blacklist.list")}
                        {entries.length > 0 && (
                            <span className="ml-2 text-xs font-semibold text-rose-700 bg-(--pastel-pink) px-2 py-0.5 rounded-full">
                                {entries.length}
                            </span>
                        )}
                    </h3>
                </div>

                {list.isError ? (
                    <p className="text-sm text-rose-600">{t("settings.blacklist.loadFailed")}</p>
                ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-(--pastel-green) flex items-center justify-center mb-4">
                            <ShieldBan className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="font-semibold text-foreground">{t("settings.blacklist.empty")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("settings.blacklist.emptyHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {entries.map((entry) => (
                            <div
                                key={entry.phone}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--pastel-pink-light) border border-(--card-border) hover:bg-(--pastel-pink) transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-(--pastel-pink) flex items-center justify-center shrink-0">
                                    <Phone className="h-3.5 w-3.5 text-rose-700" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-mono font-medium text-foreground">{formatPhoneDisplay(entry.phone)}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {entry.reason}
                                        {entry.added_by && <span className="opacity-70"> · {entry.added_by}</span>}
                                    </p>
                                </div>
                                <div className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                                    {entry.created_at.slice(0, 10)}
                                </div>
                                {canUnblock && (
                                    <button
                                        onClick={() => remove.mutate(entry.phone)}
                                        disabled={remove.isPending}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-rose-100 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                                        aria-label={t("settings.blacklist.remove")}
                                        title={t("settings.blacklist.remove")}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
