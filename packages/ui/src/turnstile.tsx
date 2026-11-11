"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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
    /** Called when the check cannot run (script blocked, browser refused). */
    onFailure?: () => void;
    /** "ar" or "en"; Turnstile shows its own small text in this language. */
    language?: string;
    className?: string;
    /**
     * Classes for the frame drawn around the widget while it is on screen
     * (rounded corners, border, background). Cloudflare's own 1px border is
     * clipped off so the frame matches the form's inputs.
     */
    frameClassName?: string;
    /** Called when Cloudflare shows or hides the widget (interaction-only mode). */
    onVisibleChange?: (visible: boolean) => void;
};

/** Cloudflare draws the widget 65px tall in every size. */
const WIDGET_HEIGHT = 65;

export const TurnstileBox = forwardRef<TurnstileHandle, TurnstileBoxProps>(function TurnstileBox(
    { siteKey, onToken, onFailure, language, className, frameClassName, onVisibleChange },
    ref,
) {
    const holder = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const onVisibleRef = useRef(onVisibleChange);
    onVisibleRef.current = onVisibleChange;
    const widgetId = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const onFailureRef = useRef(onFailure);
    onFailureRef.current = onFailure;

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
                    size: "flexible",
                    theme: "light",
                    callback: (token: string) => onTokenRef.current(token),
                    "expired-callback": () => onTokenRef.current(null),
                    "error-callback": () => {
                        onTokenRef.current(null);
                        onFailureRef.current?.();
                    },
                });
            })
            .catch(() => {
                onTokenRef.current(null);
                onFailureRef.current?.();
            });
        return () => {
            cancelled = true;
            if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
            widgetId.current = null;
        };
    }, [siteKey, language]);

    // In interaction-only mode Cloudflare keeps the widget at zero height until
    // a person has to tick it; watch the holder to know when it is shown.
    useEffect(() => {
        const el = holder.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let last = false;
        const observer = new ResizeObserver(() => {
            const shown = el.offsetHeight > 0;
            if (shown === last) return;
            last = shown;
            setVisible(shown);
            onVisibleRef.current?.(shown);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [siteKey]);

    if (!siteKey) return null;
    const framed = visible && frameClassName;
    return (
        <div
            className={[className, framed ? `box-border overflow-hidden ${frameClassName}` : ""].filter(Boolean).join(" ")}
            style={framed ? { height: WIDGET_HEIGHT } : undefined}
        >
            <div ref={holder} style={framed ? { margin: -1 } : undefined} />
        </div>
    );
});
