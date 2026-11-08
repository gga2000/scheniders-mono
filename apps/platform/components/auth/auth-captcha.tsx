"use client";

import { useCallback, useRef, useState } from "react";
import { TurnstileBox, type TurnstileHandle } from "@scheniders/ui/turnstile";
import { env } from "@/lib/env";
import { useLanguage } from "@/hooks/use-language";

const SITE_KEY = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * CAPTCHA state for an auth form. Supabase Auth refuses sign-in, sign-up and
 * reset requests without a valid token once its CAPTCHA protection is on.
 * Each token works once: call `reset()` after every attempt, pass or fail.
 */
export function useAuthCaptcha() {
    const ref = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const reset = useCallback(() => ref.current?.reset(), []);
    return {
        enabled: SITE_KEY.length > 0,
        /** True when the form may submit: no CAPTCHA configured, or a token is ready. */
        ready: SITE_KEY.length === 0 || token !== null,
        token: token ?? undefined,
        reset,
        ref,
        setToken,
    };
}

export function AuthCaptcha({ captcha, className }: { captcha: ReturnType<typeof useAuthCaptcha>; className?: string }) {
    const { language } = useLanguage();
    if (!captcha.enabled) return null;
    return (
        <TurnstileBox
            ref={captcha.ref}
            siteKey={SITE_KEY}
            onToken={captcha.setToken}
            language={language}
            className={className}
        />
    );
}
