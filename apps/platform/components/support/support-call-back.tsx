"use client";

import { useEffect, useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";
import { formatIraqiPhoneDisplay, normalizeIraqiMobile } from "@scheniders/shared";
import { toast } from "@/hooks/use-toast";
import { SupportRequestError, useSupportAction } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";
import type { SupportThread } from "@/lib/support/schema";

/** When the call is due, in the merchant's words: soon, or at a set hour (asked overnight). */
export function callBackWhen(dueAt: string, now: number): { key: "support.callBack.soon" } | { key: "support.callBack.at"; at: Date } {
    const due = new Date(dueAt);
    return due.getTime() > now + 60_000 ? { key: "support.callBack.at", at: due } : { key: "support.callBack.soon" };
}

type Translate = ReturnType<typeof useLanguage>["t"];

/** "Usually within minutes" or "Support opens at 9:00", for a call due at `dueAt`. */
export function callBackWhenText(t: Translate, language: string, dueAt: string, now: number): string {
    const when = callBackWhen(dueAt, now);
    if (when.key === "support.callBack.soon") return t("support.callBack.soon");
    const time = when.at.toLocaleTimeString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Baghdad",
    });
    return t("support.callBack.at", { time });
}

/**
 * "Call me back" in the Help chat: the merchant leaves a number and the call
 * lands in the staff console's Today list. Once asked, it says which number
 * we will call and when, and the number can still be changed.
 */
export function SupportCallBack({ thread }: { thread: SupportThread | undefined }) {
    const { t, language } = useLanguage();
    const action = useSupportAction();
    const [editing, setEditing] = useState(false);
    const [phone, setPhone] = useState("");
    // A call asked overnight turns from "at 9 AM" to "soon" when support opens.
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const callBack = thread?.callBack ?? null;
    const valid = normalizeIraqiMobile(phone) !== null;

    const startEditing = () => {
        setPhone(callBack?.phone ?? thread?.contactPhone ?? "");
        setEditing(true);
    };

    const submit = () => {
        if (!valid || action.isPending) return;
        action.mutate(
            { action: "callBack", phone },
            {
                onSuccess: () => setEditing(false),
                onError: (error) => {
                    const code = error instanceof SupportRequestError ? error.code : "failed";
                    toast.error(t(code === "support_bad_phone" ? "support.callBack.badPhone" : "support.error.sendFailed"));
                },
            },
        );
    };

    if (editing) {
        return (
            <div className="border-b border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
                <label htmlFor="support-call-back-phone" className="text-xs font-semibold text-foreground">
                    {t("support.callBack.label")}
                </label>
                <div className="mt-2 flex items-center gap-2">
                    <input
                        id="support-call-back-phone"
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="07XX XXX XXXX"
                        maxLength={40}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!valid || action.isPending}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-primary dark:text-(--primary-fg)"
                    >
                        {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                        {t("support.callBack.send")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="h-9 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                    >
                        {t("support.callBack.cancel")}
                    </button>
                </div>
            </div>
        );
    }

    if (callBack) {
        return (
            <div className="flex items-center gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
                <PhoneCall className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-sm font-semibold text-foreground">
                        {t("support.callBack.asked", { phone: formatIraqiPhoneDisplay(callBack.phone) })}
                    </p>
                    <p dir="auto" className="text-xs text-muted">{callBackWhenText(t, language, callBack.due_at, now)}</p>
                </div>
                <button type="button" onClick={startEditing} className="shrink-0 text-xs font-semibold text-foreground underline-offset-2 hover:underline">
                    {t("support.callBack.change")}
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 py-2">
            <p dir="auto" className="text-xs text-muted">{t("support.callBack.offer")}</p>
            <button
                type="button"
                onClick={startEditing}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
                <PhoneCall className="h-3.5 w-3.5" />
                {t("support.callBack.button")}
            </button>
        </div>
    );
}
