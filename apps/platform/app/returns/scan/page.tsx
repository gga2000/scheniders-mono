"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useContinuousScanner } from "@/hooks/use-continuous-scanner";
import { extractScannedOrderId } from "@/lib/scan-utils";
import { playScanBeep, playErrorBuzz, primeOnFirstGesture } from "@/lib/returns/sounds";
import { returnsPairingTopic } from "@/lib/returns/pairing-topic";
import { useLanguage } from "@/hooks/use-language";
import { AlertTriangle, Check, Flashlight } from "lucide-react";

const overlay: React.CSSProperties = {
    position: "absolute", inset: 0, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 3,
};

/** The laptop answers every scan; these three mean it was not added. */
function isWarning(result: string): boolean {
    return result === "duplicate" || result === "not_found" || result === "anomaly";
}

function ackKey(result: string, customer: string | null): string {
    if (result === "duplicate") return "intake.phone.ack.duplicate";
    if (result === "not_found") return "intake.phone.ack.notFound";
    if (result === "anomaly") return "intake.phone.ack.anomaly";
    return customer ? "intake.phone.ack.addedFor" : "intake.phone.ack.added";
}

function ReturnsScanInner() {
    const params = useSearchParams();
    const token = params.get("s") || "";
    const storeId = params.get("t") || "";
    const { user } = useAuth();
    const userId = user?.id;
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [count, setCount] = useState(0);
    const { t } = useLanguage();
    // The laptop's answer to the last scan; worded at render, in the page's language.
    const [last, setLast] = useState<{ result: string; orderId: string; customer: string | null } | null>(null);
    const lastSentRef = useRef<{ id: string; ts: number } | null>(null);

    useEffect(() => { primeOnFirstGesture(); }, []);

    useEffect(() => {
        // A private channel: it opens only for a signed-in member of the store.
        const topic = userId ? returnsPairingTopic(storeId, token) : null;
        if (!topic) return;
        const channel = supabase.channel(topic, { config: { private: true, presence: { key: "scanner" } } });
        channel
            .on("broadcast", { event: "ack" }, ({ payload }) => {
                const r = payload?.result as string;
                const warn = isWarning(r);
                setLast({ result: r, orderId: String(payload?.order_id ?? ""), customer: payload?.customer ? String(payload.customer) : null });
                if (!warn) setCount((c) => c + 1);
                if (warn) playErrorBuzz(); else playScanBeep();
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate(warn ? [40, 40, 40] : 60);
                }
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") await channel.track({ role: "scanner", online_at: new Date().toISOString() });
            });
        channelRef.current = channel;
        return () => { channel.unsubscribe(); channelRef.current = null; };
    }, [token, storeId, userId]);

    const handleScan = (raw: string) => {
        const orderId = extractScannedOrderId(raw);
        if (!orderId) return;
        const now = Date.now();
        // Debounce identical reads (continuous scanner fires every frame while a code is in view).
        if (lastSentRef.current && lastSentRef.current.id === orderId && now - lastSentRef.current.ts < 2500) return;
        lastSentRef.current = { id: orderId, ts: now };
        channelRef.current?.send({ type: "broadcast", event: "scan", payload: { order_id: orderId, ts: now } });
    };

    const { videoRef, status, errorType, retry, torchSupported, torchOn, toggleTorch } = useContinuousScanner({
        onScan: handleScan,
        enabled: !!token && !!user,
    });
    const [manual, setManual] = useState("");

    if (!token || !returnsPairingTopic(storeId, token)) {
        return <div dir="auto" style={{ padding: 24, color: "#fff", background: "#0e0e10", minHeight: "100dvh" }}>{t("intake.phone.noToken")}</div>;
    }
    if (!user) {
        return <div dir="auto" style={{ padding: 24, color: "#fff", background: "#0e0e10", minHeight: "100dvh" }}>{t("intake.phone.signIn")}</div>;
    }

    return (
        <div style={{ position: "fixed", inset: 0, background: "#0e0e10", color: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", background: "#11231a", color: "#cfeed6", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
                <span dir="auto">{t("intake.phone.title")}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {torchSupported && (
                        <button onClick={toggleTorch} aria-pressed={torchOn}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: torchOn ? "#51e08a" : "transparent", color: torchOn ? "#0e0e10" : "#cfeed6", border: "1px solid #2f6b41", borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                            <Flashlight size={14} aria-hidden />
                            {t("intake.phone.torch")}
                        </button>
                    )}
                    <span>● {t("intake.phone.live")}</span>
                </span>
            </div>

            <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: "72%", maxWidth: 300, aspectRatio: "1.5", border: "3px solid #51e08a", borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,0.30)" }} />
                </div>
                {status === "requesting" && <div style={overlay}>{t("intake.phone.starting")}</div>}
                {status === "error" && (
                    <div style={overlay}>
                        <div style={{ textAlign: "center", padding: 24 }}>
                            <p dir="auto" style={{ marginBottom: 12 }}>
                                {t(errorType === "permission-denied" ? "scanner.blockedHint"
                                    : errorType === "no-camera" ? "scanner.noCamera"
                                        : errorType === "camera-in-use" ? "scanner.inUseHint"
                                            : "intake.phone.cameraFailed")}
                            </p>
                            <button onClick={retry} style={{ padding: "10px 18px", borderRadius: 12, background: "#51e08a", color: "#0e0e10", fontWeight: 700, border: "none" }}>{t("scanner.retry")}</button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ padding: 16, textAlign: "center", zIndex: 2 }}>
                {last && (() => {
                    const warn = isWarning(last.result);
                    const Icon = warn ? AlertTriangle : Check;
                    return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8, padding: "10px 12px", borderRadius: 12, background: warn ? "#3a1f23" : "#16351f", border: `1px solid ${warn ? "#7d3340" : "#2f6b41"}` }}>
                            <Icon size={16} aria-hidden />
                            <span dir="auto">{t(ackKey(last.result, last.customer), { id: last.orderId, customer: last.customer ?? "" })}</span>
                        </div>
                    );
                })()}
                <div style={{ fontSize: 22, fontWeight: 800 }}>{count}</div>
                <div dir="auto" style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>{t("intake.phone.countCaption")}</div>
                <form onSubmit={(e) => { e.preventDefault(); const v = manual.trim(); if (v) { handleScan(v); setManual(""); } }}
                    style={{ display: "flex", gap: 8 }}>
                    <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric"
                        placeholder={t("intake.phone.manualPlaceholder")} aria-label={t("intake.phone.manualPlaceholder")} dir="auto"
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#15151a", color: "#fff", fontSize: 14 }} />
                    <button type="submit" style={{ padding: "10px 16px", borderRadius: 12, background: "#51e08a", color: "#0e0e10", fontWeight: 700, border: "none" }}>{t("intake.phone.send")}</button>
                </form>
            </div>
        </div>
    );
}

function Loading() {
    const { t } = useLanguage();
    return <div dir="auto" style={{ padding: 24 }}>{t("common.loading")}</div>;
}

export default function ReturnsScanPage() {
    return (
        <Suspense fallback={<Loading />}>
            <ReturnsScanInner />
        </Suspense>
    );
}
