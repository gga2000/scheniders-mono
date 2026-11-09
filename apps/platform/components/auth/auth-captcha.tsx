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
    const waiters = useRef<((token: string | undefined) => void)[]>([]);
    const settle = useCallback((value: string | undefined) => {
        for (const resolve of waiters.current.splice(0)) resolve(value);
    }, []);
    const reset = useCallback(() => ref.current?.reset(), []);
    const onToken = useCallback((next: string | null) => {
        setToken(next);
        if (next) {
            setFailed(false);
            settle(next);
        }
    }, [settle]);
    const onFailure = useCallback(() => {
        setFailed(true);
        settle(undefined);
    }, [settle]);
    /**
     * Throws away the current token and waits for the next one. For flows that
     * need two checks in a row (sign-up: our server, then Supabase sign-in).
     * Resolves undefined when no CAPTCHA is configured, the check fails, or no
     * token arrives within `timeoutMs`.
     */
    const fresh = useCallback(
        (timeoutMs = 20_000): Promise<string | undefined> => {
            if (SITE_KEY.length === 0) return Promise.resolve(undefined);
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    waiters.current = waiters.current.filter((w) => w !== done);
                    resolve(undefined);
                }, timeoutMs);
                const done = (value: string | undefined) => {
                    clearTimeout(timer);
                    resolve(value);
                };
                waiters.current.push(done);
                ref.current?.reset();
            });
        },
        [],
    );
    return {
        enabled: SITE_KEY.length > 0,
        /** True when the form may submit: no CAPTCHA configured, or a token is ready. */
        ready: SITE_KEY.length === 0 || token !== null,
        token: token ?? undefined,
        failed,
        reset,
        fresh,
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
