"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Cloudflare Turnstile box for auth forms. Supabase Auth's CAPTCHA protection
 * needs a fresh token on every sign-in, sign-up and reset request. A token
 * works once, so callers `reset()` after each attempt.
 *
 * Renders nothing when `siteKey` is empty, so forms keep working until the
 * key is configured.
 */

type TurnstileApi = {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    reset: (id: string) => void;
    remove: (id: string) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
        script.onerror = () => {
            scriptPromise = null;
            reject(new Error("turnstile failed to load"));
        };
        document.head.appendChild(script);
    });
    return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

export type TurnstileBoxProps = {
    siteKey: string;
    /** Called with a token when solved, and with null when it expires or fails. */
    onToken: (token: string | null) => void;
    /** "ar" or "en"; Turnstile shows its own small text in this language. */
    language?: string;
    className?: string;
};

export const TurnstileBox = forwardRef<TurnstileHandle, TurnstileBoxProps>(function TurnstileBox(
    { siteKey, onToken, language, className },
    ref,
) {
    const holder = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    useImperativeHandle(ref, () => ({
        reset: () => {
            onTokenRef.current(null);
            if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        },
    }));

    useEffect(() => {
        if (!siteKey || !holder.current) return;
        let cancelled = false;
        const el = holder.current;
        loadTurnstile()
            .then((api) => {
                if (cancelled) return;
                widgetId.current = api.render(el, {
                    sitekey: siteKey,
                    language: language ?? "auto",
                    appearance: "interaction-only",
                    callback: (token: string) => onTokenRef.current(token),
                    "expired-callback": () => onTokenRef.current(null),
                    "error-callback": () => onTokenRef.current(null),
                });
            })
            .catch(() => onTokenRef.current(null));
        return () => {
            cancelled = true;
            if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
            widgetId.current = null;
        };
    }, [siteKey, language]);

    if (!siteKey) return null;
    return <div ref={holder} className={className} />;
});
