"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Check, Download, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShareQrDialogProps {
    open: boolean;
    onClose: () => void;
    storeUrl: string;
    businessName: string;
}

export function ShareQrDialog({ open, onClose, storeUrl, businessName }: ShareQrDialogProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Generate QR code as data URL
    useEffect(() => {
        if (!open) return;

        // Dynamic import of qrcode library
        import("qrcode").then((QRCode) => {
            QRCode.toDataURL(storeUrl, {
                width: 300,
                margin: 2,
                color: { dark: "#000000", light: "#ffffff" },
            }).then(setQrDataUrl);
        }).catch(() => {
            // Fallback: generate a placeholder
            setQrDataUrl(null);
        });
    }, [open, storeUrl]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(storeUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [storeUrl]);

    const handleDownload = useCallback(() => {
        if (!qrDataUrl) return;
        const link = document.createElement("a");
        link.download = `${businessName.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
        link.href = qrDataUrl;
        link.click();
    }, [qrDataUrl, businessName]);

    const handleWhatsAppShare = useCallback(() => {
        const text = encodeURIComponent(`تسوق من ${businessName}: ${storeUrl}`);
        window.open(`https://wa.me/?text=${text}`, "_blank");
    }, [storeUrl, businessName]);

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/50"
                    />

                    {/* Dialog */}
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Share your store"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative w-full max-w-sm mx-4 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-(--card-border)">
                            <div className="flex items-center gap-2">
                                <Share2 className="w-4 h-4 text-primary" />
                                <h3 className="text-sm font-semibold">Share Your Store</h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close dialog"
                                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4">
                            {/* URL copy */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={storeUrl}
                                    readOnly
                                    className="flex-1 px-3 py-2 rounded-lg border border-(--card-border) bg-muted/10 text-sm font-mono truncate"
                                    dir="ltr"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    aria-label={copied ? "Copied to clipboard" : "Copy store URL"}
                                    className="p-2 rounded-lg border border-(--card-border) hover:bg-muted/30 transition-colors"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </button>
                            </div>

                            {/* QR Code */}
                            <div className="flex flex-col items-center gap-3">
                                {qrDataUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={qrDataUrl}
                                        alt="Store QR Code"
                                        className="w-48 h-48 rounded-xl border border-(--card-border) p-2 bg-white"
                                    />
                                ) : (
                                    <div className="w-48 h-48 rounded-xl border border-(--card-border) bg-muted/10 flex items-center justify-center text-muted-foreground text-sm">
                                        Generating QR...
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={!qrDataUrl}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-(--card-border) text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download PNG
                                </button>
                            </div>

                            {/* WhatsApp share */}
                            <button
                                type="button"
                                onClick={handleWhatsAppShare}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                                Share via WhatsApp
                            </button>
                        </div>

                        <canvas ref={canvasRef} className="hidden" />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
