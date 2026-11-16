"use client";

// =====================================================================
// SetupHelpOffer: «تريد نساعدك بالإعداد؟» under the setup wizard (Fermi B11)
// =====================================================================
// A new merchant asks our team to call and set the store up with them, for
// free. It is a call-back marked "setup" (POST /api/support): it comes first
// in the staff console's Today list with the number to call, and the Help
// chat shows the same call. Once asked, it says which number we will call
// and when, and the number can still be changed.
// =====================================================================

import { useEffect, useState } from "react";
import { Check, Loader2, PhoneCall } from "lucide-react";
import { formatIraqiPhoneDisplay, normalizeIraqiMobile } from "@scheniders/shared";
import { callBackWhenText } from "@/components/support/support-call-back";
import { useLanguage } from "@/hooks/use-language";
import { SupportRequestError, useSupportAction, useSupportThread } from "@/hooks/use-support";
import { toast } from "@/hooks/use-toast";

const BOX = "mt-4 rounded-2xl border border-border bg-(--card-bg) px-4 py-3";

export function SetupHelpOffer({ defaultPhone }: { defaultPhone: string }) {
    const { t, language } = useLanguage();
    const thread = useSupportThread(false);
    const action = useSupportAction();
    const [editing, setEditing] = useState(false);
    const [phone, setPhone] = useState("");
    // A call asked overnight turns from "at 9 AM" to "soon" when support opens.
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const asked = thread.data?.callBack?.topic === "setup" ? thread.data.callBack : null;
    const valid = normalizeIraqiMobile(phone) !== null;

    const startEditing = () => {
        setPhone(asked?.phone ?? thread.data?.contactPhone ?? normalizeIraqiMobile(defaultPhone) ?? "");
        setEditing(true);
    };

    const submit = () => {
        if (!valid || action.isPending) return;
        action.mutate(
            { action: "callBack", phone, topic: "setup" },
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
            <section className={BOX} data-testid="setup-help">
                <label htmlFor="setup-help-phone" className="text-sm font-semibold text-foreground">
                    {t("support.callBack.label")}
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                        id="setup-help-phone"
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="07XX XXX XXXX"
                        maxLength={40}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!valid || action.isPending}
                        data-testid="setup-help-send"
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                        {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PhoneCall className="h-4 w-4" aria-hidden="true" />}
                        {t("support.callBack.send")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="h-10 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {t("support.callBack.cancel")}
                    </button>
                </div>
            </section>
        );
    }

    if (asked) {
        return (
            <section className={BOX} data-testid="setup-help">
                <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground" data-testid="setup-help-asked">
                            {t("wizard.help.asked", { phone: formatIraqiPhoneDisplay(asked.phone) })}
                        </p>
                        <p className="text-xs text-muted-foreground">{callBackWhenText(t, language, asked.due_at, now)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={startEditing}
                        className="shrink-0 text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                        {t("support.callBack.change")}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className={BOX} aria-labelledby="setup-help-title" data-testid="setup-help">
            <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/5 text-foreground">
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p id="setup-help-title" className="text-sm font-semibold text-foreground">
                        {t("wizard.help.title")}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("wizard.help.body")}</p>
                </div>
                <button
                    type="button"
                    onClick={startEditing}
                    data-testid="setup-help-yes"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
                >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    {t("wizard.help.yes")}
                </button>
            </div>
        </section>
    );
}
