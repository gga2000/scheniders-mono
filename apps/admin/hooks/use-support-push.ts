"use client";

import { useCallback, useEffect, useState } from "react";
import { sendStep } from "@/lib/send-json";

/** Public VAPID key; the same pair the merchant app and the push senders use. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
const WORKER_URL = "/support-sw.js";

/**
 * unsupported: this browser (or this deploy, without the key) cannot get pushes.
 * blocked: the person said no to notifications; only browser settings undo it.
 */
export type SupportPushState = "checking" | "unsupported" | "blocked" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Turning alerts on or off twice changes nothing more, so a lost answer may just be pressed again. */
const ALERTS_UNSURE = "No answer came back, so alerts may have changed. Pressing again is safe.";

/** Stores or removes this device through the console's one sender, so its words match every other write. */
async function send(method: "POST" | "DELETE", body: unknown): Promise<void> {
  await sendStep<unknown>("/api/support/push", body, method, ALERTS_UNSURE, "Could not change alerts.");
}

function supported(): boolean {
  return (
    VAPID_PUBLIC_KEY !== "" &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** "Phone alerts" for new support messages on this device. */
export function useSupportPush() {
  const [state, setState] = useState<SupportPushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!supported()) return "unsupported" as const;
      if (Notification.permission === "denied") return "blocked" as const;
      const registration = await navigator.serviceWorker.getRegistration(WORKER_URL);
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? ("on" as const) : ("off" as const);
    }
    check().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      () => {
        if (!cancelled) setState("unsupported");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register(WORKER_URL);
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
        }));
      await send("POST", subscription.toJSON());
      setState("on");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(WORKER_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await send("DELETE", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, turnOn, turnOff };
}
