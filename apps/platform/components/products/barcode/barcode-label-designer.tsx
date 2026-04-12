"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Printer,
    Tag,
    Maximize2,
    Minimize2,
    RectangleHorizontal,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BarcodeLabelDesignerProps {
    productName: string;
    productPrice: number;
    barcode: string;
    sku?: string;
    productSlug?: string;
    quantity?: number;
}

type LabelSize = "small" | "standard" | "large";

const LABEL_SIZES: Record<LabelSize, { label: string; width: string; height: string; pxW: number; pxH: number }> = {
    small: { label: "Small (2\" × 1\")", width: "2in", height: "1in", pxW: 192, pxH: 96 },
    standard: { label: "Standard (3\" × 2\")", width: "3in", height: "2in", pxW: 288, pxH: 192 },
    large: { label: "Large (4\" × 2.5\")", width: "4in", height: "2.5in", pxW: 384, pxH: 240 },
};

const SIZE_ICONS: Record<LabelSize, typeof Tag> = {
    small: Minimize2,
    standard: RectangleHorizontal,
    large: Maximize2,
};

export function BarcodeLabelDesigner({
    productName,
    productPrice,
    barcode,
    sku,
    productSlug,
    quantity = 1,
}: BarcodeLabelDesignerProps) {
    const { t } = useLanguage();
    const [selectedSize, setSelectedSize] = useState<LabelSize>("standard");
    const [qrDataUrl, setQrDataUrl] = useState<string>("");

    // Generate QR
    useEffect(() => {
        if (!productSlug) {
            setQrDataUrl("");
            return;
        }
        QRCode.toDataURL(`/store/products/${productSlug}`, {
            width: 64,
            margin: 1,
            color: { dark: "#1a1a1a", light: "#ffffff" },
        })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(""));
    }, [productSlug]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const config = LABEL_SIZES[selectedSize];

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    {t("products.barcode.labelDesigner") || "Label Designer"}
                </h2>
                <button
                    type="button"
                    onClick={handlePrint}
                    disabled={!barcode}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Printer className="w-4 h-4" />
                    {t("products.barcode.print") || "Print"}
                    {quantity > 1 && ` (${quantity})`}
                </button>
            </div>

            {/* Size selector */}
            <div className="flex gap-2">
                {(Object.keys(LABEL_SIZES) as LabelSize[]).map((size) => {
                    const Icon = SIZE_ICONS[size];
                    return (
                        <button
                            key={size}
                            type="button"
                            onClick={() => setSelectedSize(size)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                selectedSize === size
                                    ? "border-teal-400 bg-[var(--pastel-mint)] text-teal-700"
                                    : "border-[var(--card-border)] bg-[var(--background)] text-muted hover:text-foreground"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {LABEL_SIZES[size].label}
                        </button>
                    );
                })}
            </div>

            {/* Label preview */}
            <div className="flex justify-center py-4">
                <div
                    className="bg-white border-2 border-dashed border-gray-300 rounded-sm overflow-hidden flex"
                    style={{ width: config.pxW, height: config.pxH }}
                >
                    <LabelContent
                        productName={productName}
                        productPrice={productPrice}
                        barcode={barcode}
                        sku={sku}
                        qrDataUrl={qrDataUrl}
                        size={selectedSize}
                    />
                </div>
            </div>

            {/* Print-only content (hidden on screen) */}
            <div className="hidden print:block">
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        .print-labels, .print-labels * { visibility: visible; }
                        .print-labels {
                            position: absolute;
                            top: 0;
                            left: 0;
                            display: flex;
                            flex-wrap: wrap;
                            gap: 4px;
                        }
                        .print-label-item {
                            width: ${config.width};
                            height: ${config.height};
                            page-break-inside: avoid;
                        }
                    }
                `}</style>
                <div className="print-labels">
                    {Array.from({ length: quantity }).map((_, i) => (
                        <div key={i} className="print-label-item">
                            <LabelContent
                                productName={productName}
                                productPrice={productPrice}
                                barcode={barcode}
                                sku={sku}
                                qrDataUrl={qrDataUrl}
                                size={selectedSize}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {!barcode && (
                <p className="text-xs text-center text-muted">
                    {t("products.barcode.noBarcodeHint") || "Enter a barcode above to preview the label"}
                </p>
            )}
        </div>
    );
}

// ---- Inner label content component ----

function LabelContent({
    productName,
    productPrice,
    barcode,
    sku,
    qrDataUrl,
    size,
}: {
    productName: string;
    productPrice: number;
    barcode: string;
    sku?: string;
    qrDataUrl: string;
    size: LabelSize;
}) {
    const barcodeSvgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!barcode || !barcodeSvgRef.current) return;
        const barcodeHeight = size === "small" ? 20 : size === "standard" ? 30 : 40;
        const fontSize = size === "small" ? 8 : size === "standard" ? 10 : 12;
        try {
            JsBarcode(barcodeSvgRef.current, barcode, {
                format: "CODE128",
                width: size === "small" ? 1 : 1.2,
                height: barcodeHeight,
                displayValue: true,
                fontSize,
                margin: 2,
                background: "transparent",
                lineColor: "#000000",
            });
        } catch {
            // invalid barcode value
        }
    }, [barcode, size]);

    const isSmall = size === "small";
    const nameSize = isSmall ? "text-[7px]" : size === "standard" ? "text-[9px]" : "text-xs";
    const priceSize = isSmall ? "text-[8px]" : size === "standard" ? "text-sm" : "text-base";
    const skuSize = isSmall ? "text-[6px]" : "text-[8px]";
    const qrSize = isSmall ? 28 : size === "standard" ? 40 : 52;
    const padding = isSmall ? "p-1" : size === "standard" ? "p-2" : "p-3";

    return (
        <div className={`w-full h-full flex flex-col justify-between ${padding} text-gray-900`}>
            {/* Top row: name + price */}
            <div className="flex items-start justify-between gap-1">
                <p className={`${nameSize} font-semibold leading-tight line-clamp-2 flex-1`}>
                    {productName}
                </p>
                <p className={`${priceSize} font-bold whitespace-nowrap`}>
                    {formatIQD(productPrice)}
                </p>
            </div>

            {/* Middle: barcode */}
            <div className="flex items-center justify-center flex-1">
                {barcode ? (
                    <svg ref={barcodeSvgRef} className="max-w-full" />
                ) : (
                    <div className={`${skuSize} text-gray-400`}>No barcode</div>
                )}
            </div>

            {/* Bottom row: SKU + QR */}
            <div className="flex items-end justify-between gap-1">
                {sku && (
                    <p className={`${skuSize} text-gray-500 font-mono`}>
                        SKU: {sku}
                    </p>
                )}
                {!sku && <span />}
                {qrDataUrl && (
                    <img
                        src={qrDataUrl}
                        alt="QR"
                        style={{ width: qrSize, height: qrSize }}
                    />
                )}
            </div>
        </div>
    );
}
