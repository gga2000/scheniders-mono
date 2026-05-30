"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useContinuousScanner } from "@/hooks/use-continuous-scanner";
import { extractScannedOrderId } from "@/lib/scan-utils";

const overlay: React.CSSProperties = {
    position: "absolute", inset: 0, display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 3,
};

function ReturnsScanInner() {
    const params = useSearchParams();
    const token = params.get("s") || "";
    const { user } = useAuth();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [count, setCount] = useState(0);
    const [last, setLast] = useState<{ text: string; warn: boolean } | null>(null);
    const lastSentRef = useRef<{ id: string; ts: number } | null>(null);

    useEffect(() => {
        if (!token) return;
        const channel = supabase.channel(`returns:${token}`, { config: { presence: { key: "scanner" } } });
        channel
            .on("broadcast", { event: "ack" }, ({ payload }) => {
                const r = payload?.result as string;
                if (r === "duplicate") setLast({ text: `${payload.order_id} — already scanned`, warn: true });
                else if (r === "not_found") setLast({ text: `${payload.order_id} — not found`, warn: true });
                else if (r === "anomaly") setLast({ text: `${payload.order_id} — flagged on laptop`, warn: true });
                else {
                    setLast({ text: `${payload.order_id}${payload.customer ? " · " + payload.customer : ""} added`, warn: false });
                    setCount((c) => c + 1);
                }
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate(r && r !== "added" ? [40, 40, 40] : 60);
                }
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") await channel.track({ role: "scanner", online_at: new Date().toISOString() });
            });
        channelRef.current = channel;
        return () => { channel.unsubscribe(); channelRef.current = null; };
    }, [token]);

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

    if (!token) {
        return <div style={{ padding: 24, color: "#fff", background: "#0e0e10", minHeight: "100dvh" }}>Missing pairing token — scan the QR on the laptop again.</div>;
    }
    if (!user) {
        return <div style={{ padding: 24, color: "#fff", background: "#0e0e10", minHeight: "100dvh" }}>Please sign in on this device, then re-open the laptop QR.</div>;
    }

    return (
        <div style={{ position: "fixed", inset: 0, background: "#0e0e10", color: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", background: "#11231a", color: "#cfeed6", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
                <span>📱 Returns · linked</span>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {torchSupported && (
                        <button onClick={toggleTorch}
                            style={{ background: torchOn ? "#51e08a" : "transparent", color: torchOn ? "#0e0e10" : "#cfeed6", border: "1px solid #2f6b41", borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                            🔦 {torchOn ? "On" : "Off"}
                        </button>
                    )}
                    <span>● live</span>
                </span>
            </div>

            <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: "72%", maxWidth: 300, aspectRatio: "1.5", border: "3px solid #51e08a", borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,0.30)" }} />
                </div>
                {status === "requesting" && <div style={overlay}>Starting camera…</div>}
                {status === "error" && (
                    <div style={overlay}>
                        <div style={{ textAlign: "center", padding: 24 }}>
                            <p style={{ marginBottom: 12 }}>
                                {errorType === "permission-denied" ? "Camera blocked — allow camera access in your browser, then retry."
                                    : errorType === "no-camera" ? "No camera found on this device."
                                        : errorType === "camera-in-use" ? "Camera is in use by another app — close it and retry."
                                            : "Couldn't start the camera."}
                            </p>
                            <button onClick={retry} style={{ padding: "10px 18px", borderRadius: 12, background: "#51e08a", color: "#0e0e10", fontWeight: 700, border: "none" }}>Retry</button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ padding: 16, textAlign: "center", zIndex: 2 }}>
                {last && (
                    <div style={{ marginBottom: 8, padding: "10px 12px", borderRadius: 12, background: last.warn ? "#3a1f23" : "#16351f", border: `1px solid ${last.warn ? "#7d3340" : "#2f6b41"}` }}>
                        {last.warn ? "⚠ " : "✓ "}{last.text}
                    </div>
                )}
                <div style={{ fontSize: 22, fontWeight: 800 }}>{count}</div>
                <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>scanned this session · point at the next label</div>
                <form onSubmit={(e) => { e.preventDefault(); const v = manual.trim(); if (v) { handleScan(v); setManual(""); } }}
                    style={{ display: "flex", gap: 8 }}>
                    <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric"
                        placeholder="Type an order ID if it won't scan…"
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#15151a", color: "#fff", fontSize: 14 }} />
                    <button type="submit" style={{ padding: "10px 16px", borderRadius: 12, background: "#51e08a", color: "#0e0e10", fontWeight: 700, border: "none" }}>Send</button>
                </form>
            </div>
        </div>
    );
}

export default function ReturnsScanPage() {
    return (
        <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
            <ReturnsScanInner />
        </Suspense>
    );
}
