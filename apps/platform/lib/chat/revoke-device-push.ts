/**
 * Stop this device getting the signed-in user's push alerts: delete the
 * server row for this browser's subscription, then drop the subscription.
 *
 * Run while the session is still valid (the delete needs the caller's token).
 * No service worker or no subscription means there is nothing to revoke.
 */
export async function revokeDevicePush(accessToken: string): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const res = await fetch("/api/chat/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) throw new Error(`push unsubscribe returned ${res.status}`);
    await sub.unsubscribe();
}
