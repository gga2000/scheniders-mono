"use client";

import { useEffect, useState } from "react";
import { Delete, Lock } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTillUnlock } from "@/hooks/use-till";
import type { TillMember } from "@/hooks/use-shops";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

interface Props {
    shopId: string;
    /** Who can switch in at this shop: its staff and the managers. */
    cashiers: TillMember[];
    onUnlocked: (sessionId: string, cashier: TillMember) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** Pick who is at the till, then type their 4-digit PIN. */
export function TillLockScreen({ shopId, cashiers, onUnlocked }: Props) {
    const { t } = useLanguage();
    const unlock = useTillUnlock();
    const [who, setWho] = useState<TillMember | null>(cashiers.length === 1 ? cashiers[0] : null);
    const [pin, setPin] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const check = (member: TillMember, full: string) =>
        unlock.mutate(
            { shopId, userId: member.user_id, pin: full },
            {
                onSuccess: (r) => {
                    setPin("");
                    if (r.status === "ok" && r.session_id) onUnlocked(r.session_id, member);
                    else setMessage(t(r.status === "locked" ? "till.lock.tooMany" : `till.lock.${r.status}`));
                },
                onError: () => {
                    setPin("");
                    setMessage(t("till.lock.failed"));
                },
            },
        );

    const press = (key: (typeof KEYS)[number]) => {
        if (!who || unlock.isPending) return;
        setMessage(null);
        if (key === "del") {
            setPin((p) => p.slice(0, -1));
            return;
        }
        if (!key || pin.length >= 4) return;
        const next = pin + key;
        setPin(next);
        // A full PIN checks itself.
        if (next.length === 4) check(who, next);
    };

    // Typing on a keyboard works too.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
            else if (e.key === "Backspace") press("del");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    return (
        <div className="flex h-full items-center justify-center p-8">
            <div className="grid w-full max-w-[880px] gap-8 rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 md:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        {t("till.lock.locked")}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("till.lock.whoIs")}</h1>
                    {cashiers.length === 0 ? (
                        <p className="text-left text-sm text-muted" dir="auto">{t("till.lock.nobody")}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {cashiers.map((m) => (
                                <button
                                    key={m.user_id}
                                    type="button"
                                    onClick={() => {
                                        setWho(m);
                                        setPin("");
                                        setMessage(null);
                                    }}
                                    aria-pressed={who?.user_id === m.user_id}
                                    className={cn(
                                        "flex h-14 items-center gap-3 rounded-2xl border px-4 text-base font-semibold",
                                        who?.user_id === m.user_id
                                            ? `border-transparent ${INK_BUTTON}`
                                            : "border-[var(--card-border)] text-foreground",
                                        !m.has_pin && "opacity-60",
                                    )}
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E4C1F9] text-sm text-[#1E1E1E]">
                                        {m.display_name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span dir="auto">{m.display_name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="text-left text-sm text-muted" dir="auto">{t("till.lock.noPinHint")}</p>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex h-14 items-center justify-center gap-3" aria-live="polite">
                        {[0, 1, 2, 3].map((i) => (
                            <span
                                key={i}
                                className={cn(
                                    "h-4 w-4 rounded-full border-2 border-[var(--ink)] dark:border-[#EFFF00]",
                                    i < pin.length && "bg-[var(--ink)] dark:bg-[#EFFF00]",
                                )}
                            />
                        ))}
                    </div>
                    <p className={cn("min-h-5 text-center text-sm", message ? "font-semibold text-red-600" : "text-muted")} dir="auto">
                        {message ?? (who ? t("till.lock.typePin", { name: who.display_name }) : t("till.lock.pickFirst"))}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {KEYS.map((k, i) =>
                            k === "" ? (
                                <span key={i} />
                            ) : (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => press(k)}
                                    disabled={!who || unlock.isPending}
                                    aria-label={k === "del" ? t("till.lock.delete") : k}
                                    className="flex h-16 items-center justify-center rounded-2xl border border-[var(--card-border)] text-2xl font-semibold tabular-nums text-foreground disabled:opacity-40"
                                >
                                    {k === "del" ? <Delete className="h-6 w-6" aria-hidden="true" /> : k}
                                </button>
                            ),
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
