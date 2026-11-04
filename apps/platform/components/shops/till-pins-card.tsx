"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useClearPin, useSetMyPin, type TillMember } from "@/hooks/use-shops";
import { tillPinSchema } from "@/lib/till/shop-forms";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";

interface Props {
    members: TillMember[];
    loading: boolean;
    /** Managers also see the team list and can clear a forgotten PIN. */
    manage: boolean;
}

/** Each person's 4-digit till PIN: set your own; managers see who has one and clear forgotten ones. */
export function TillPinsCard({ members, loading, manage }: Props) {
    const { t } = useLanguage();
    const { user } = useAuth();
    const me = members.find((m) => m.user_id === user?.id);

    return (
        <section className={`${CARD} flex flex-col gap-4 p-5`}>
            <div>
                <h2 className="text-lg font-bold text-foreground">{t("till.pin.title")}</h2>
                <p className="text-left text-sm text-muted" dir="auto">{t("till.pin.subtitle")}</p>
            </div>

            <MyPinForm hasPin={me?.has_pin ?? false} />

            {manage && (
                <div className="flex flex-col">
                    <h3 className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("till.pin.team")}</h3>
                    {loading ? (
                        <div className="h-24 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
                    ) : (
                        members.map((m) => <PinRow key={m.user_id} member={m} isMe={m.user_id === user?.id} />)
                    )}
                </div>
            )}
        </section>
    );
}

function MyPinForm({ hasPin }: { hasPin: boolean }) {
    const { t } = useLanguage();
    const setPin = useSetMyPin();
    const [pin, setPinValue] = useState("");
    const [bad, setBad] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tillPinSchema.safeParse(pin).success) {
            setBad(true);
            return;
        }
        setPin.mutate(pin, {
            onSuccess: () => {
                setPinValue("");
                toast({ title: t("till.pin.saved"), variant: "success" });
            },
            onError: () => toast({ title: t("till.pin.saveFailed"), variant: "error" }),
        });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-1.5 rounded-2xl bg-[var(--card-border)]/30 p-4">
            <label htmlFor="my-till-pin" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {hasPin ? t("till.pin.change") : t("till.pin.set")}
            </label>
            <div className="flex gap-2">
                <input
                    id="my-till-pin"
                    value={pin}
                    onChange={(e) => {
                        setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4));
                        setBad(false);
                    }}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="••••"
                    aria-invalid={bad || undefined}
                    className={cn(
                        "h-12 w-32 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 text-center text-lg tracking-[0.5em] text-foreground outline-none focus:border-[var(--ink)] dark:focus:border-[#EFFF00]",
                        bad && "border-red-500",
                    )}
                />
                <button
                    type="submit"
                    disabled={setPin.isPending}
                    className="h-12 rounded-2xl bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#EFFF00] dark:text-[#121212]"
                >
                    {t("till.pin.savePin")}
                </button>
            </div>
            <span className={cn("text-left text-xs", bad ? "text-red-600" : "text-muted")} dir="auto">
                {bad ? t("till.pin.error") : hasPin ? t("till.pin.hasPin") : t("till.pin.hint")}
            </span>
        </form>
    );
}

function PinRow({ member, isMe }: { member: TillMember; isMe: boolean }) {
    const { t } = useLanguage();
    const clear = useClearPin();
    return (
        <div className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--card-border)] py-2">
            <span className="min-w-0">
                <span className="text-left block truncate text-sm font-semibold text-foreground" dir="auto">
                    {member.display_name}
                    {isMe && <span className="ml-1 font-normal text-muted">{t("till.pin.you")}</span>}
                </span>
                <span className={cn("text-xs", member.has_pin ? "text-emerald-700 dark:text-emerald-400" : "text-muted")}>
                    {member.has_pin ? t("till.pin.statusSet") : t("till.pin.statusNone")}
                </span>
            </span>
            {member.has_pin && (
                <button
                    type="button"
                    disabled={clear.isPending}
                    onClick={() =>
                        clear.mutate(member.user_id, {
                            onSuccess: () => toast({ title: t("till.pin.cleared", { name: member.display_name }), variant: "success" }),
                            onError: () => toast({ title: t("till.pin.saveFailed"), variant: "error" }),
                        })
                    }
                    className="h-12 shrink-0 rounded-full px-4 text-sm font-semibold text-muted hover:text-foreground disabled:opacity-50"
                >
                    {t("till.pin.clear")}
                </button>
            )}
        </div>
    );
}
