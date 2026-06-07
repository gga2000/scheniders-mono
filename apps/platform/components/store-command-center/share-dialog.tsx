"use client";

import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";

interface ShareDialogProps {
    url: string;
    businessName: string;
    onClose: () => void;
}

export function ShareDialog({ url, businessName, onClose }: ShareDialogProps) {
    const [copied, setCopied] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        QRCode.toDataURL(url, {
            width: 200,
            margin: 1,
            color: { dark: "#18181b", light: "#ffffff" },
        })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(null));
    }, [url]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const copy = async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                ref={dialogRef}
                className="relative glass-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground">Share your store</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">{businessName}</p>

                {/* QR Code */}
                <div className="flex justify-center mb-4">
                    {qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={qrDataUrl}
                            alt="Store QR code"
                            width={160}
                            height={160}
                            className="rounded-xl border border-border"
                        />
                    ) : (
                        <div className="w-40 h-40 rounded-xl border border-border bg-muted/40 flex items-center justify-center">
                            <QrCode className="w-8 h-8 text-muted-foreground" />
                        </div>
                    )}
                </div>

                {/* URL + copy */}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                    <span className="flex-1 text-xs text-foreground font-mono truncate">{url}</span>
                    <button
                        onClick={copy}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                            <Copy className="w-3.5 h-3.5" />
                        )}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
            </div>
        </div>
    );
}
