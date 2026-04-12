"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Barcode,
    QrCode,
    Copy,
    Check,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useLanguage } from "@/hooks/use-language";

interface BarcodeGeneratorProps {
    barcode: string;
    onChange: (barcode: string) => void;
    productSlug?: string;
    productSku?: string;
    disabled?: boolean;
}

export function BarcodeGenerator({
    barcode,
    onChange,
    productSlug,
    productSku,
    disabled = false,
}: BarcodeGeneratorProps) {
    const { t } = useLanguage();
    const barcodeSvgRef = useRef<SVGSVGElement>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [barcodeError, setBarcodeError] = useState(false);

    // Render barcode SVG whenever value changes
    useEffect(() => {
        if (!barcode || !barcodeSvgRef.current) {
            setBarcodeError(false);
            return;
        }
        try {
            JsBarcode(barcodeSvgRef.current, barcode, {
                format: "CODE128",
                width: 1.5,
                height: 40,
                displayValue: true,
                fontSize: 12,
                margin: 4,
                background: "transparent",
                lineColor: "currentColor",
            });
            setBarcodeError(false);
        } catch {
            setBarcodeError(true);
        }
    }, [barcode]);

    // Generate QR code data URL
    useEffect(() => {
        if (!productSlug) {
            setQrDataUrl("");
            return;
        }
        const url = `/store/products/${productSlug}`;
        QRCode.toDataURL(url, {
            width: 96,
            margin: 1,
            color: { dark: "#1a1a1a", light: "#ffffff" },
        })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(""));
    }, [productSlug]);

    const handleAutoGenerate = useCallback(() => {
        if (disabled) return;
        let prefix: string;
        if (productSku && productSku.length >= 3) {
            prefix = productSku.substring(0, 6).toUpperCase();
        } else {
            prefix = "PRD";
        }
        const seq = Math.floor(100000 + Math.random() * 900000).toString();
        const generated = `${prefix}-${seq}`;
        onChange(generated);
    }, [disabled, productSku, onChange]);

    const handleCopy = useCallback(async () => {
        if (!barcode) return;
        try {
            await navigator.clipboard.writeText(barcode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback
            const textarea = document.createElement("textarea");
            textarea.value = barcode;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [barcode]);

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4">
            {/* Header */}
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Barcode className="w-4 h-4" />
                {t("products.barcode.title") || "Barcode & QR Code"}
            </h2>

            {/* Barcode input row */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={barcode}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        placeholder={t("products.barcode.placeholder") || "Enter barcode number..."}
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>

                {/* Copy button */}
                <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!barcode}
                    className="flex items-center justify-center w-11 h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t("products.barcode.copy") || "Copy barcode"}
                >
                    {copied ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                        <Copy className="w-4 h-4" />
                    )}
                </button>

                {/* Auto-generate button */}
                <button
                    type="button"
                    onClick={handleAutoGenerate}
                    disabled={disabled}
                    className="flex items-center gap-2 px-4 py-3 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    <Sparkles className="w-4 h-4" />
                    {t("products.barcode.autoGenerate") || "Auto-generate"}
                </button>
            </div>

            {/* Preview row */}
            {(barcode || productSlug) && (
                <div className="flex items-start gap-4 pt-2">
                    {/* Barcode preview */}
                    {barcode && (
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <div className="bg-white rounded-lg p-3 border border-gray-100 inline-flex items-center justify-center">
                                <svg
                                    ref={barcodeSvgRef}
                                    className="text-gray-900"
                                    style={{ maxWidth: "100%" }}
                                />
                            </div>
                            {barcodeError && (
                                <p className="text-xs text-red-500">
                                    {t("products.barcode.invalidBarcode") || "Invalid barcode value"}
                                </p>
                            )}
                        </div>
                    )}

                    {/* QR code preview */}
                    {productSlug && qrDataUrl && (
                        <div className="flex flex-col items-center gap-1">
                            <div className="bg-white rounded-lg p-2 border border-gray-100 inline-flex">
                                <img
                                    src={qrDataUrl}
                                    alt="QR Code"
                                    className="w-20 h-20"
                                />
                            </div>
                            <p className="text-[10px] text-muted flex items-center gap-1">
                                <QrCode className="w-3 h-3" />
                                {t("products.barcode.storeLink") || "Store link"}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Regenerate hint */}
            {barcode && !disabled && (
                <button
                    type="button"
                    onClick={handleAutoGenerate}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    {t("products.barcode.regenerate") || "Regenerate barcode"}
                </button>
            )}
        </div>
    );
}
