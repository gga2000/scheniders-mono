"use client";

// =====================================================================
// SignupPhoneCheck: the owner proves their WhatsApp number (Fermi B11)
// =====================================================================
// Shown at signup only while the console's switch is on. The merchant types
// their mobile and taps Send; a 6-digit code arrives on WhatsApp; typing all
// six checks it at once. The check hands back a proof that the signup sends
// with the form. Sending a code spends a CAPTCHA token, so the form's own
// check is reset for the signup that follows.
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { z } from "zod";
import { formatIraqiPhoneDisplay, normalizeIraqiMobile } from "@scheniders/shared";
import type { useAuthCaptcha } from "@/components/auth/auth-captcha";
import type { useLanguage } from "@/hooks/use-language";

type Translate = ReturnType<typeof useLanguage>["t"];

const switchSchema = z.object({ success: z.literal(true), data: z.object({ phone_code: z.boolean() }) });
const sentSchema = z.object({ success: z.literal(true), data: z.object({ resend_after: z.number() }) });
const proofSchema = z.object({ success: z.literal(true), data: z.object({ proof: z.string() }) });
const refusalSchema = z.object({ error: z.string() });

/**
 * Whether signup asks for the code: null until the page knows. An unreadable
 * switch reads as off, and the signup route, which always decides, answers
 * "phone_unverified" if it is on: `markOn` then shows the code box.
 */
export function useSignupPhoneCodeSwitch(): { on: boolean | null; markOn: () => void } {
    const [on, setOn] = useState<boolean | null>(null);
    useEffect(() => {
        let live = true;
        fetch("/api/auth/phone-code", { cache: "no-store" })
            .then(async (res) => switchSchema.parse(await res.json()).data.phone_code)
            .catch(() => false)
            .then((value) => {
                if (live) setOn(value);
            });
        return () => {
            live = false;
        };
    }, []);
    return { on, markOn: useCallback(() => setOn(true), []) };
}

const SEND_ERRORS: Record<string, string> = {
    bad_phone: "signup.code.badPhone",
    too_many: "signup.code.tooMany",
    captcha_failed: "signup.captchaRejected",
    captcha_unavailable: "signup.code.sendFailed",
    send_failed: "signup.code.sendFailed",
};

const CHECK_ERRORS: Record<string, string> = {
    wrong: "signup.code.wrong",
    locked: "signup.code.locked",
    expired: "signup.code.expired",
    too_many: "signup.code.tooMany",
};

async function refusal(res: Response): Promise<string> {
    const parsed = refusalSchema.safeParse(await res.json().catch(() => null));
    return parsed.success ? parsed.data.error : "failed";
}

const FIELD =
    "w-full h-[52px] pl-10 pr-3 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition disabled:opacity-60";
const DARK_BUTTON =
    "h-[52px] shrink-0 rounded-2xl px-4 text-sm font-semibold text-white bg-[#1E1E1E] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5";
const LINK = "text-[13px] font-medium text-[#1E1E1E] underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline";

export function SignupPhoneCheck({
    phone,
    onPhoneChange,
    proof,
    onProof,
    captcha,
    t,
    dir,
}: {
    phone: string;
    onPhoneChange: (value: string) => void;
    proof: string | null;
    onProof: (proof: string | null) => void;
    captcha: ReturnType<typeof useAuthCaptcha>;
    t: Translate;
    dir: "ltr" | "rtl";
}) {
    const [stage, setStage] = useState<"enter" | "code">("enter");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [resendAt, setResendAt] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const mobile = normalizeIraqiMobile(phone);
    const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

    useEffect(() => {
        if (resendAt <= Date.now()) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [resendAt]);

    const restart = () => {
        onProof(null);
        setStage("enter");
        setCode("");
        setErrorKey(null);
    };

    const send = async () => {
        if (!mobile || busy || !captcha.ready) return;
        setBusy(true);
        setErrorKey(null);
        try {
            const res = await fetch("/api/auth/phone-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: mobile, captcha_token: captcha.token }),
            });
            if (!res.ok) {
                setErrorKey(SEND_ERRORS[await refusal(res)] ?? "signup.code.sendFailed");
                return;
            }
            const sent = sentSchema.parse(await res.json());
            setResendAt(Date.now() + sent.data.resend_after * 1000);
            setNow(Date.now());
            setCode("");
            setStage("code");
        } catch {
            setErrorKey("signup.code.sendFailed");
        } finally {
            // The server spent this token whatever the outcome.
            captcha.reset();
            setBusy(false);
        }
    };

    const check = async (typed: string) => {
        if (!mobile) return;
        setBusy(true);
        setErrorKey(null);
        try {
            const res = await fetch("/api/auth/phone-code/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: mobile, code: typed }),
            });
            if (!res.ok) {
                setErrorKey(CHECK_ERRORS[await refusal(res)] ?? "signup.code.checkFailed");
                setCode("");
                return;
            }
            onProof(proofSchema.parse(await res.json()).data.proof);
        } catch {
            setErrorKey("signup.code.checkFailed");
        } finally {
            setBusy(false);
        }
    };

    const typeCode = (value: string) => {
        const digits = value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/\D/g, "").slice(0, 6);
        setCode(digits);
        if (digits.length === 6 && !busy) void check(digits);
    };

    if (proof) {
        return (
            <div data-testid="signup-phone-check">
                <p className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.code.phoneLabel")}</p>
                <div className="flex items-center gap-3 rounded-2xl border border-[#C0EBA6] bg-[#E8F8E0] px-4 py-3">
                    <Check className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
                    <span dir="ltr" className="text-[15px] font-medium tabular-nums text-[#1E1E1E]" data-testid="signup-phone-verified">
                        {formatIraqiPhoneDisplay(phone)}
                    </span>
                    <span dir={dir} className="flex-1 text-left text-[13px] text-green-800">
                        {t("signup.code.verified")}
                    </span>
                    <button type="button" onClick={restart} className={LINK}>
                        {t("signup.code.change")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="signup-phone-check">
            <label htmlFor="signup-phone" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">
                {t("signup.code.phoneLabel")}
            </label>
            <div className="flex gap-2">
                <div className="relative group flex-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <MessageCircle className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                    </div>
                    <input
                        id="signup-phone"
                        type="tel"
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => onPhoneChange(e.target.value)}
                        disabled={stage === "code"}
                        placeholder="07XX XXX XXXX"
                        maxLength={40}
                        required
                        className={FIELD}
                    />
                </div>
                {stage === "enter" && (
                    <button type="button" onClick={send} disabled={!mobile || busy || !captcha.ready} data-testid="signup-code-send" className={DARK_BUTTON}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {t("signup.code.send")}
                    </button>
                )}
            </div>

            {stage === "enter" && (
                <p dir={dir} className="mt-1.5 text-left text-xs text-[#8A847A]">
                    {t("signup.code.why")}
                </p>
            )}

            {stage === "code" && (
                <div className="mt-3 space-y-2">
                    <p dir={dir} className="text-left text-[13px] text-[#5F5A52]">
                        {t("signup.code.sent", { phone: mobile ? formatIraqiPhoneDisplay(mobile) : phone })}{" "}
                        <button type="button" onClick={restart} className={LINK}>
                            {t("signup.code.change")}
                        </button>
                    </p>
                    <label htmlFor="signup-code" className="sr-only">
                        {t("signup.code.label")}
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="signup-code"
                            dir="ltr"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={code}
                            onChange={(e) => typeCode(e.target.value)}
                            disabled={busy}
                            placeholder="••••••"
                            maxLength={12}
                            data-testid="signup-code-input"
                            className="h-[52px] w-40 rounded-2xl border border-[#E2DCCF] bg-white px-4 text-center text-xl font-semibold tracking-[0.4em] tabular-nums text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
                        />
                        {busy && <Loader2 className="h-5 w-5 animate-spin text-[#1E1E1E]" aria-hidden="true" />}
                        <button
                            type="button"
                            onClick={send}
                            disabled={waitSeconds > 0 || busy || !captcha.ready}
                            data-testid="signup-code-resend"
                            className={`${LINK} ms-auto`}
                        >
                            {waitSeconds > 0 ? t("signup.code.resendIn", { seconds: waitSeconds }) : t("signup.code.resend")}
                        </button>
                    </div>
                </div>
            )}

            {errorKey && (
                <p dir={dir} role="alert" className="mt-1.5 text-left text-xs text-red-600" data-testid="signup-code-error">
                    {t(errorKey)}
                </p>
            )}
        </div>
    );
}
