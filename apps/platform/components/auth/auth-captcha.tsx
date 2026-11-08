"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { TurnstileBox, type TurnstileHandle } from "@scheniders/ui/turnstile";
import { env } from "@/lib/env";
import { useLanguage, useTextDir } from "@/hooks/use-language";

const SITE_KEY = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * CAPTCHA state for an auth form. Supabase Auth refuses sign-in, sign-up and
 * reset requests without a valid token once its CAPTCHA protection is on.
 * Each token works once: call `reset()` after every attempt, pass or fail.
 */
export function useAuthCaptcha() {
    const ref = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const reset = useCallback(() => ref.current?.reset(), []);
    const onToken = useCallback((next: string | null) => {
        setToken(next);
        if (next) setFailed(false);
    }, []);
    const onFailure = useCallback(() => setFailed(true), []);
    return {
        enabled: SITE_KEY.length > 0,
        /** True when the form may submit: no CAPTCHA configured, or a token is ready. */
        ready: SITE_KEY.length === 0 || token !== null,
        token: token ?? undefined,
        failed,
        reset,
        ref,
        onToken,
        onFailure,
    };
}

export function AuthCaptcha({ captcha, className }: { captcha: ReturnType<typeof useAuthCaptcha>; className?: string }) {
    const { language, t } = useLanguage();
    const dir = useTextDir();
    if (!captcha.enabled) return null;
    return (
        <div className={className}>
            <TurnstileBox
                ref={captcha.ref}
                siteKey={SITE_KEY}
                onToken={captcha.onToken}
                onFailure={captcha.onFailure}
                language={language}
            />
            {captcha.failed && (
                <p role="alert" className="flex items-start gap-2 text-[13px] text-[#8A3B12]">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span dir={dir} className="text-left">{t("auth.captcha.failed")}</span>
                </p>
            )}
        </div>
    );
}
