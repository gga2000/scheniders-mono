// apps/platform/hooks/chat/use-web-push.ts
//
// Encapsulates the browser Push API subscription lifecycle.
// Guards SSR and missing VAPID key explicitly — never throws on those cases.

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { diag } from "@/lib/diag";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert the base-64 VAPID public key (URL-safe) to a Uint8Array for
 * pushManager.subscribe({ applicationServerKey }).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WebPushState {
    /** Browser supports service-workers + PushManager + Notification API */
    supported: boolean;
    /** NEXT_PUBLIC_VAPID_PUBLIC_KEY is present in the client env */
    configured: boolean;
    /** Current Notification.permission value (or null on SSR) */
    permission: NotificationPermission | null;
    /** Whether a push subscription is currently active for this user */
    subscribed: boolean;
    /** Request permission → subscribe → POST /api/chat/push/subscribe */
    enable: () => Promise<void>;
    /** Unsubscribe → POST /api/chat/push/unsubscribe */
    disable: () => Promise<void>;
    /** True while enable() or disable() is in flight */
    busy: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWebPush(): WebPushState {
    const { session } = useAuth();
    const { t } = useLanguage();

    const [permission, setPermission] = useState<NotificationPermission | null>(null);
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);

    // Feature detection — all browser-only; safe to default to false on SSR.
    const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

    // Guard missing VAPID key: read once at module time (string or undefined).
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const configured = typeof vapidKey === "string" && vapidKey.length > 0;

    // Sync permission state from the browser.
    useEffect(() => {
        if (!supported) return;
        setPermission(Notification.permission);
    }, [supported]);

    // Check whether a subscription already exists on mount.
    useEffect(() => {
        if (!supported || !configured) return;
        let cancelled = false;
        (async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (!cancelled) setSubscribed(sub !== null);
            } catch (e) {
                // Non-critical, but log it: a failure here makes the control
                // render as "off" when it may not be.
                diag.warn(`[push] could not read existing subscription: ${String(e)}`);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [supported, configured]);

    const enable = useCallback(async () => {
        if (!supported || !configured || !vapidKey) return;
        if (busy) return;
        setBusy(true);
        try {
            // 1. Request notification permission.
            const perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== "granted") return;

            // 2. Register (or reuse) the service worker.
            const reg = await navigator.serviceWorker.register("/sw.js");
            await navigator.serviceWorker.ready;

            // 3. Subscribe with VAPID.
            const keyBytes = urlBase64ToUint8Array(vapidKey);
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyBytes.buffer.slice(
                    keyBytes.byteOffset,
                    keyBytes.byteOffset + keyBytes.byteLength
                ) as ArrayBuffer,
            });

            // 4. POST the subscription to our API. Until this succeeds the
            //    server cannot push to this browser, so it is not "subscribed".
            const token = session?.access_token;
            if (!token) {
                throw new Error("no access token — sign-in has not finished loading");
            }

            const json = sub.toJSON();
            const keys = json.keys as { p256dh: string; auth: string } | undefined;
            const res = await fetch("/api/chat/push/subscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    endpoint: sub.endpoint,
                    p256dh: keys?.p256dh ?? "",
                    auth: keys?.auth ?? "",
                    userAgent: navigator.userAgent,
                }),
            });

            // The response used to be ignored: a 401 or 500 still flipped the
            // control to "on" while the server had no subscription row, so push
            // silently reached nobody and the UI insisted it was working.
            if (!res.ok) {
                throw new Error(`subscribe endpoint returned ${res.status} ${(await res.text()).slice(0, 200)}`);
            }

            setSubscribed(true);
        } catch (e) {
            // Never swallow this. A failure here is indistinguishable from
            // "nothing happened" for the person clicking the switch.
            const reason = e instanceof Error ? e.message : String(e);
            diag.warn(`[push] enable failed: ${reason}`);
            toast.error(
                t("notifications.pushEnableFailed", "Couldn't turn on notifications"),
                reason,
            );
        } finally {
            setBusy(false);
        }
    }, [supported, configured, vapidKey, busy, session, t]);

    const disable = useCallback(async () => {
        if (!supported || !configured || busy) return;
        setBusy(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) {
                setSubscribed(false);
                return;
            }

            const endpoint = sub.endpoint;
            await sub.unsubscribe();

            const token = session?.access_token;
            if (token) {
                await fetch("/api/chat/push/unsubscribe", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ endpoint }),
                });
            }

            setSubscribed(false);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            diag.warn(`[push] disable failed: ${reason}`);
            toast.error(
                t("notifications.pushDisableFailed", "Couldn't turn off notifications"),
                reason,
            );
        } finally {
            setBusy(false);
        }
    }, [supported, configured, busy, session, t]);

    return {
        supported,
        configured,
        permission,
        subscribed,
        enable,
        disable,
        busy,
    };
}
