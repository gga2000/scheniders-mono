"use client";

import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";
import type { LocaleCode } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";
import { toast } from "@/hooks/use-toast";

interface ShareDialogProps {
    url: string;
    businessName: string;
    onClose: () => void;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

export function ShareDialog({ url, businessName, onClose, locale }: ShareDialogProps) {
    const [copied, setCopied] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (copiedTimer.current) clearTimeout(copiedTimer.current);
        },
        [],
    );

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
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Clipboard is blocked (permissions, insecure context): say so instead of faking "Copied".
            toast.error(t(STRINGS.command_center.share_copy_failed, locale));
            return;
        }
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-dialog-title"
                className="relative rounded-2xl border border-border bg-(--card-bg) p-6 w-full max-w-sm shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 id="share-dialog-title" className="text-base font-semibold text-foreground">
                        {t(STRINGS.command_center.share_heading, locale)}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.command_center.dialog_close, locale)}
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
                            alt={t(STRINGS.command_center.share_qr_alt, locale)}
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
                        type="button"
                        onClick={copy}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                            <Copy className="w-3.5 h-3.5" />
                        )}
                        {copied
                            ? t(STRINGS.command_center.share_copied, locale)
                            : t(STRINGS.command_center.share_copy, locale)}
                    </button>
                </div>
            </div>
        </div>
    );
}
