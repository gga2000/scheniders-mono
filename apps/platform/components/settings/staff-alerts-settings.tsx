"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus, Trash2, Phone, AlertTriangle, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { authedFetch } from "@/lib/authed-fetch";

interface StaffEntry {
    phone: string;
    name?: string;
    added_at?: string;
}

interface StaffAlertConfig {
    enabled: boolean;
    numbers: StaffEntry[];
}

const API = "/api/settings/staff-alert";

export function StaffAlertsSettings() {
    const { session } = useAuth();
    const { t } = useLanguage();
    const [config, setConfig] = useState<StaffAlertConfig>({ enabled: false, numbers: [] });
    const [loading, setLoading] = useState(true);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [phoneError, setPhoneError] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [togglingEnabled, setTogglingEnabled] = useState(false);


    const load = useCallback(async () => {
        try {
            const res = await authedFetch(API, { cache: "no-store" });
            if (res.ok) {
                const data = (await res.json()) as StaffAlertConfig;
                setConfig({
                    enabled: data.enabled === true,
                    numbers: Array.isArray(data.numbers) ? data.numbers : [],
                });
            }
        } catch {
            // ignore — keep defaults
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (session?.access_token) load();
    }, [load, session?.access_token]);

    const validatePhone = (raw: string): string => {
        const digits = raw.replace(/\D/g, "");
        if (!digits) return t("settings.staff.phoneRequired");
        const local = digits.replace(/^964/, "").replace(/^0/, "");
        if (local.length !== 10 || !local.startsWith("7")) {
            return t("settings.staff.phoneInvalid");
        }
        const exists = config.numbers.some((n) => {
            const existing = n.phone.replace(/\D/g, "").replace(/^964/, "").replace(/^0/, "");
            return existing === local;
        });
        if (exists) return t("settings.staff.phoneExists");
        return "";
    };

    const handleAdd = async () => {
        const err = validatePhone(phone);
        if (err) {
            setPhoneError(err);
            return;
        }
        setIsAdding(true);
        try {
            const res = await authedFetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, name: name.trim() || undefined }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || t("settings.staff.addFailed"));
            }
            const updated = (await res.json()) as StaffAlertConfig;
            setConfig(updated);
            setPhone("");
            setName("");
            setPhoneError("");
            toast.success(t("settings.staff.added"));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t("settings.staff.addFailed"));
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemove = async (phoneToRemove: string) => {
        try {
            const res = await authedFetch(`${API}?phone=${encodeURIComponent(phoneToRemove)}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(t("settings.staff.removeFailed"));
            const updated = (await res.json()) as StaffAlertConfig;
            setConfig(updated);
            toast.success(t("settings.staff.removed"));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t("settings.staff.removeFailed"));
        }
    };

    const handleToggleEnabled = async () => {
        setTogglingEnabled(true);
        try {
            const next = !config.enabled;
            const res = await authedFetch(API, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) throw new Error(t("settings.staff.updateFailed"));
            const updated = (await res.json()) as StaffAlertConfig;
            setConfig(updated);
            toast.success(next ? t("settings.staff.on") : t("settings.staff.off"));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t("settings.staff.updateFailed"));
        } finally {
            setTogglingEnabled(false);
        }
    };

    const formatPhoneDisplay = (raw: string): string => {
        const d = raw.replace(/\D/g, "").replace(/^964/, "").replace(/^0/, "");
        if (d.length !== 10) return raw;
        return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    };

    if (loading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.staff.title")}</h2>
                <p className="text-sm text-muted-foreground">
                    {t("settings.staff.subtitle")}
                </p>
            </div>

            {/* Enable / disable toggle */}
            <div className="pastel-card p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                            <BellRing className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-foreground">{t("settings.staff.alerts")}</h3>
                            <p className="text-xs text-muted-foreground">
                                {t("settings.staff.alertsHint")}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleToggleEnabled}
                        disabled={togglingEnabled}
                        className={
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 " +
                            (config.enabled ? "bg-amber-500" : "bg-muted")
                        }
                        aria-pressed={config.enabled}
                    >
                        <span
                            className={
                                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                                (config.enabled ? "translate-x-6" : "translate-x-1")
                            }
                        />
                    </button>
                </div>
            </div>

            {/* Add staff form */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                        <Plus className="h-4 w-4 text-teal-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{t("settings.staff.add")}</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("settings.staff.phone")}
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="tel"
                                placeholder="07XXXXXXXXX"
                                value={phone}
                                onChange={(e) => {
                                    setPhone(e.target.value);
                                    setPhoneError("");
                                }}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                className="w-full h-9 pl-8 pr-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("settings.staff.name")}
                        </label>
                        <input
                            type="text"
                            placeholder={t("settings.staff.namePh")}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            className="w-full h-9 px-3 rounded-xl border border-(--card-border) bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handleAdd}
                            disabled={isAdding}
                            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
                        >
                            <Plus className="h-4 w-4" />
                            {t("settings.staff.addBtn")}
                        </button>
                    </div>
                </div>

                {phoneError && (
                    <p className="flex items-center gap-1.5 mt-2 text-xs text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {phoneError}
                    </p>
                )}

                <p className="mt-3 text-xs text-muted-foreground">
                    {t("settings.staff.normalized")}
                </p>
            </div>

            {/* Registered staff list */}
            <div className="pastel-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground">
                        {t("settings.staff.list")}
                        {config.numbers.length > 0 && (
                            <span className="ml-2 text-xs font-semibold text-amber-700 bg-(--pastel-yellow) px-2 py-0.5 rounded-full">
                                {config.numbers.length}
                            </span>
                        )}
                    </h3>
                </div>

                {config.numbers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-(--pastel-yellow) flex items-center justify-center mb-4">
                            <BellRing className="h-8 w-8 text-amber-700" />
                        </div>
                        <p className="font-semibold text-foreground">{t("settings.staff.empty")}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t("settings.staff.emptyHint")}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {config.numbers.map((entry) => (
                            <div
                                key={entry.phone}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--pastel-yellow-light, var(--pastel-yellow)) border border-(--card-border) group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center shrink-0">
                                    <User className="h-3.5 w-3.5 text-amber-700" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-foreground truncate">
                                        {entry.name || t("settings.staff.member")}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        {formatPhoneDisplay(entry.phone)}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemove(entry.phone)}
                                    className="h-8 w-8 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-60 group-hover:opacity-100"
                                    aria-label={t("settings.staff.removeOne", { name: entry.name || entry.phone })}
                                    title={t("settings.staff.remove")}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
