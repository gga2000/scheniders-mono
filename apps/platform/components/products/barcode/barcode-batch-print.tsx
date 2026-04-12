"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Printer,
    FileDown,
    X,
    Barcode,
    Minus,
    Plus,
    Package,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BarcodeBatchPrintProps {
    products: Array<{
        id: string;
        name: string;
        price: number;
        barcode?: string;
        sku?: string;
        slug?: string;
    }>;
    onClose: () => void;
}

type LabelSize = "small" | "standard" | "large";

const LABEL_CONFIGS: Record<LabelSize, { label: string; widthIn: number; heightIn: number; cols: number; rows: number }> = {
    small: { label: "Small (2\" × 1\")", widthIn: 2, heightIn: 1, cols: 4, rows: 10 },
    standard: { label: "Standard (3\" × 2\")", widthIn: 3, heightIn: 2, cols: 2, rows: 5 },
    large: { label: "Large (4\" × 2.5\")", widthIn: 4, heightIn: 2.5, cols: 2, rows: 4 },
};

const PX_PER_INCH = 96;

export function BarcodeBatchPrint({ products, onClose }: BarcodeBatchPrintProps) {
    const { t } = useLanguage();
    const [labelSize, setLabelSize] = useState<LabelSize>("standard");
    const [quantities, setQuantities] = useState<Record<string, number>>(() => {
        const q: Record<string, number> = {};
        products.forEach((p) => { q[p.id] = 1; });
        return q;
    });
    const [exporting, setExporting] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const config = LABEL_CONFIGS[labelSize];
    const totalLabels = products.reduce((sum, p) => sum + (quantities[p.id] || 0), 0);

    const updateQuantity = useCallback((id: string, delta: number) => {
        setQuantities((prev) => ({
            ...prev,
            [id]: Math.max(0, (prev[id] || 0) + delta),
        }));
    }, []);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const handleExportPDF = useCallback(async () => {
        setExporting(true);
        try {
            const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
            const pageW = 8.5;
            const pageH = 11;
            const marginX = (pageW - config.cols * config.widthIn) / 2;
            const marginY = (pageH - config.rows * config.heightIn) / 2;

            // Build label list
            const labels: Array<{ name: string; price: number; barcode: string; sku: string; slug?: string }> = [];
            for (const product of products) {
                const qty = quantities[product.id] || 0;
                if (!product.barcode || qty === 0) continue;
                for (let i = 0; i < qty; i++) {
                    labels.push({
                        name: product.name,
                        price: product.price,
                        barcode: product.barcode,
                        sku: product.sku || "",
                        slug: product.slug,
                    });
                }
            }

            const labelsPerPage = config.cols * config.rows;

            for (let i = 0; i < labels.length; i++) {
                if (i > 0 && i % labelsPerPage === 0) {
                    pdf.addPage();
                }

                const pageIndex = i % labelsPerPage;
                const col = pageIndex % config.cols;
                const row = Math.floor(pageIndex / config.cols);
                const x = marginX + col * config.widthIn;
                const y = marginY + row * config.heightIn;
                const lbl = labels[i];

                // Label border
                pdf.setDrawColor(200);
                pdf.setLineWidth(0.005);
                pdf.rect(x, y, config.widthIn, config.heightIn);

                const pad = 0.08;
                const innerW = config.widthIn - pad * 2;

                // Product name
                pdf.setFontSize(labelSize === "small" ? 6 : labelSize === "standard" ? 8 : 10);
                pdf.setFont("helvetica", "bold");
                const nameText = lbl.name.length > 30 ? lbl.name.substring(0, 28) + "..." : lbl.name;
                pdf.text(nameText, x + pad, y + pad + 0.1);

                // Price
                const priceText = formatIQD(lbl.price);
                const priceWidth = pdf.getTextWidth(priceText);
                pdf.text(priceText, x + config.widthIn - pad - priceWidth, y + pad + 0.1);

                // Barcode as SVG -> canvas -> image
                try {
                    const canvas = document.createElement("canvas");
                    const barcodeHeight = labelSize === "small" ? 25 : labelSize === "standard" ? 35 : 50;
                    JsBarcode(canvas, lbl.barcode, {
                        format: "CODE128",
                        width: 1.5,
                        height: barcodeHeight,
                        displayValue: true,
                        fontSize: labelSize === "small" ? 8 : 10,
                        margin: 2,
                        background: "#ffffff",
                        lineColor: "#000000",
                    });
                    const barcodeDataUrl = canvas.toDataURL("image/png");
                    const barcodeImgW = innerW * 0.7;
                    const barcodeImgH = config.heightIn * 0.4;
                    const barcodeX = x + pad;
                    const barcodeY = y + pad + 0.18;
                    pdf.addImage(barcodeDataUrl, "PNG", barcodeX, barcodeY, barcodeImgW, barcodeImgH);
                } catch {
                    // skip barcode if generation fails
                }

                // QR code
                if (lbl.slug) {
                    try {
                        const qrUrl = await QRCode.toDataURL(`/store/products/${lbl.slug}`, {
                            width: 64,
                            margin: 1,
                        });
                        const qrSize = config.heightIn * 0.3;
                        pdf.addImage(
                            qrUrl,
                            "PNG",
                            x + config.widthIn - pad - qrSize,
                            y + config.heightIn - pad - qrSize,
                            qrSize,
                            qrSize
                        );
                    } catch {
                        // skip QR
                    }
                }

                // SKU
                if (lbl.sku) {
                    pdf.setFontSize(labelSize === "small" ? 5 : 7);
                    pdf.setFont("courier", "normal");
                    pdf.text(`SKU: ${lbl.sku}`, x + pad, y + config.heightIn - pad);
                }
            }

            pdf.save("barcode-labels.pdf");
        } catch (err) {
            console.error("PDF export failed:", err);
        } finally {
            setExporting(false);
        }
    }, [products, quantities, config, labelSize]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Barcode className="w-5 h-5" />
                        {t("products.barcode.batchPrint") || "Batch Print Labels"}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-4 px-6 py-3 border-b border-[var(--card-border)] bg-[var(--background)]">
                    <label className="text-sm text-muted">
                        {t("products.barcode.labelSize") || "Label size"}:
                    </label>
                    <select
                        value={labelSize}
                        onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                        className="px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
                    >
                        {(Object.keys(LABEL_CONFIGS) as LabelSize[]).map((size) => (
                            <option key={size} value={size}>
                                {LABEL_CONFIGS[size].label}
                            </option>
                        ))}
                    </select>
                    <span className="text-xs text-muted ml-auto">
                        {t("products.barcode.totalLabels") || "Total labels"}: {totalLabels}
                    </span>
                </div>

                {/* Product table */}
                <div className="flex-1 overflow-y-auto p-6">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-semibold text-muted uppercase tracking-wider border-b border-[var(--card-border)]">
                                <th className="pb-3">
                                    {t("products.barcode.product") || "Product"}
                                </th>
                                <th className="pb-3">
                                    {t("products.barcode.barcodeCol") || "Barcode"}
                                </th>
                                <th className="pb-3">
                                    {t("products.barcode.skuCol") || "SKU"}
                                </th>
                                <th className="pb-3 text-center">
                                    {t("products.barcode.qty") || "Qty"}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((product) => (
                                <tr
                                    key={product.id}
                                    className="border-b border-[var(--card-border)] last:border-0"
                                >
                                    <td className="py-3 pr-4">
                                        <div className="flex items-center gap-2">
                                            <Package className="w-4 h-4 text-muted flex-shrink-0" />
                                            <span className="text-sm text-foreground font-medium truncate max-w-[200px]">
                                                {product.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 pr-4">
                                        {product.barcode ? (
                                            <code className="text-xs bg-[var(--background)] px-2 py-1 rounded font-mono text-foreground">
                                                {product.barcode}
                                            </code>
                                        ) : (
                                            <span className="text-xs text-muted italic">
                                                {t("products.barcode.noBarcode") || "No barcode"}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className="text-xs text-muted font-mono">
                                            {product.sku || "—"}
                                        </span>
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => updateQuantity(product.id, -1)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                                            >
                                                <Minus className="w-3 h-3" />
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                value={quantities[product.id] || 0}
                                                onChange={(e) =>
                                                    setQuantities((prev) => ({
                                                        ...prev,
                                                        [product.id]: Math.max(0, parseInt(e.target.value) || 0),
                                                    }))
                                                }
                                                className="w-12 text-center text-sm py-1 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => updateQuantity(product.id, 1)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                                            >
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Print preview grid */}
                    {totalLabels > 0 && (
                        <div className="mt-6">
                            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                                {t("products.barcode.printPreview") || "Print Preview"} ({config.cols} × {config.rows} {t("products.barcode.perPage") || "per page"})
                            </h3>
                            <div
                                ref={printRef}
                                className="bg-white rounded-lg border border-gray-200 p-2 overflow-auto"
                                style={{ maxHeight: 400 }}
                            >
                                <PreviewGrid
                                    products={products}
                                    quantities={quantities}
                                    labelSize={labelSize}
                                    config={config}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between p-6 border-t border-[var(--card-border)]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground border border-[var(--card-border)] rounded-lg transition-colors"
                    >
                        {t("common.cancel") || "Cancel"}
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleExportPDF}
                            disabled={totalLabels === 0 || exporting}
                            className="flex items-center gap-2 px-4 py-2 border border-[var(--card-border)] rounded-lg text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FileDown className="w-4 h-4" />
                            {exporting
                                ? (t("products.barcode.exporting") || "Exporting...")
                                : (t("products.barcode.exportPDF") || "Export as PDF")}
                        </button>
                        <button
                            type="button"
                            onClick={handlePrint}
                            disabled={totalLabels === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Printer className="w-4 h-4" />
                            {t("products.barcode.printLabels") || "Print Labels"}
                        </button>
                    </div>
                </div>

                {/* Hidden print content */}
                <div className="hidden print:block">
                    <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            .batch-print-labels, .batch-print-labels * { visibility: visible; }
                            .batch-print-labels {
                                position: absolute;
                                top: 0;
                                left: 0;
                            }
                            .batch-print-page {
                                display: grid;
                                grid-template-columns: repeat(${config.cols}, ${config.widthIn}in);
                                grid-template-rows: repeat(${config.rows}, ${config.heightIn}in);
                                page-break-after: always;
                                justify-content: center;
                            }
                            .batch-print-page:last-child {
                                page-break-after: auto;
                            }
                            .batch-label-cell {
                                width: ${config.widthIn}in;
                                height: ${config.heightIn}in;
                                overflow: hidden;
                                border: 0.5px solid #e5e7eb;
                                box-sizing: border-box;
                                padding: 4px;
                                display: flex;
                                flex-direction: column;
                                justify-content: space-between;
                                font-family: sans-serif;
                            }
                        }
                    `}</style>
                    <PrintContent
                        products={products}
                        quantities={quantities}
                        config={config}
                        labelSize={labelSize}
                    />
                </div>
            </div>
        </div>
    );
}

// ---- Preview grid ----

function PreviewGrid({
    products,
    quantities,
    labelSize,
    config,
}: {
    products: BarcodeBatchPrintProps["products"];
    quantities: Record<string, number>;
    labelSize: LabelSize;
    config: (typeof LABEL_CONFIGS)[LabelSize];
}) {
    const labels = buildLabelList(products, quantities);
    const labelsPerPage = config.cols * config.rows;
    const pages = Math.ceil(labels.length / labelsPerPage) || 1;
    const scale = labelSize === "small" ? 0.5 : labelSize === "standard" ? 0.45 : 0.4;

    return (
        <div className="space-y-4">
            {Array.from({ length: pages }).map((_, pageIdx) => {
                const pageLabels = labels.slice(pageIdx * labelsPerPage, (pageIdx + 1) * labelsPerPage);
                return (
                    <div key={pageIdx}>
                        <p className="text-[10px] text-gray-400 mb-1">Page {pageIdx + 1}</p>
                        <div
                            className="grid gap-px bg-gray-100"
                            style={{
                                gridTemplateColumns: `repeat(${config.cols}, ${config.widthIn * PX_PER_INCH * scale}px)`,
                            }}
                        >
                            {pageLabels.map((lbl, i) => (
                                <PreviewLabel key={`${pageIdx}-${i}`} label={lbl} size={labelSize} scale={scale} config={config} />
                            ))}
                            {/* Fill remaining cells */}
                            {Array.from({ length: Math.max(0, labelsPerPage - pageLabels.length) }).map((_, i) => (
                                <div
                                    key={`empty-${i}`}
                                    className="bg-gray-50"
                                    style={{
                                        width: config.widthIn * PX_PER_INCH * scale,
                                        height: config.heightIn * PX_PER_INCH * scale,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PreviewLabel({
    label,
    size,
    scale,
    config,
}: {
    label: { name: string; price: number; barcode: string; sku: string };
    size: LabelSize;
    scale: number;
    config: (typeof LABEL_CONFIGS)[LabelSize];
}) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!label.barcode || !svgRef.current) return;
        try {
            JsBarcode(svgRef.current, label.barcode, {
                format: "CODE128",
                width: 0.8,
                height: size === "small" ? 14 : 20,
                displayValue: false,
                margin: 1,
                background: "transparent",
                lineColor: "#000000",
            });
        } catch {
            // invalid barcode
        }
    }, [label.barcode, size]);

    const w = config.widthIn * PX_PER_INCH * scale;
    const h = config.heightIn * PX_PER_INCH * scale;

    return (
        <div
            className="bg-white flex flex-col justify-between overflow-hidden"
            style={{ width: w, height: h, padding: 3 }}
        >
            <div className="flex justify-between items-start">
                <span className="text-[6px] font-semibold text-gray-800 leading-tight truncate flex-1">
                    {label.name}
                </span>
                <span className="text-[6px] font-bold text-gray-900 whitespace-nowrap ml-1">
                    {formatIQD(label.price)}
                </span>
            </div>
            {label.barcode && (
                <div className="flex justify-center">
                    <svg ref={svgRef} className="max-w-full" />
                </div>
            )}
            <div className="flex justify-between items-end">
                <span className="text-[5px] text-gray-500 font-mono">
                    {label.sku ? `SKU: ${label.sku}` : ""}
                </span>
                <span className="text-[5px] text-gray-400 font-mono">{label.barcode}</span>
            </div>
        </div>
    );
}

// ---- Print content ----

function PrintContent({
    products,
    quantities,
    config,
    labelSize,
}: {
    products: BarcodeBatchPrintProps["products"];
    quantities: Record<string, number>;
    config: (typeof LABEL_CONFIGS)[LabelSize];
    labelSize: LabelSize;
}) {
    const labels = buildLabelList(products, quantities);
    const labelsPerPage = config.cols * config.rows;
    const pages = Math.ceil(labels.length / labelsPerPage) || 1;

    return (
        <div className="batch-print-labels">
            {Array.from({ length: pages }).map((_, pageIdx) => {
                const pageLabels = labels.slice(pageIdx * labelsPerPage, (pageIdx + 1) * labelsPerPage);
                return (
                    <div key={pageIdx} className="batch-print-page">
                        {pageLabels.map((lbl, i) => (
                            <PrintLabel key={`${pageIdx}-${i}`} label={lbl} size={labelSize} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

function PrintLabel({
    label,
    size,
}: {
    label: { name: string; price: number; barcode: string; sku: string };
    size: LabelSize;
}) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!label.barcode || !svgRef.current) return;
        const h = size === "small" ? 20 : size === "standard" ? 30 : 40;
        try {
            JsBarcode(svgRef.current, label.barcode, {
                format: "CODE128",
                width: 1.2,
                height: h,
                displayValue: true,
                fontSize: size === "small" ? 8 : 10,
                margin: 2,
                background: "transparent",
                lineColor: "#000000",
            });
        } catch {
            // skip
        }
    }, [label.barcode, size]);

    const nameSize = size === "small" ? "7px" : size === "standard" ? "9px" : "11px";
    const priceSize = size === "small" ? "8px" : size === "standard" ? "11px" : "13px";

    return (
        <div className="batch-label-cell">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: nameSize, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {label.name}
                </span>
                <span style={{ fontSize: priceSize, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 4 }}>
                    {formatIQD(label.price)}
                </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
                <svg ref={svgRef} style={{ maxWidth: "100%" }} />
            </div>
            {label.sku && (
                <div style={{ fontSize: "6px", color: "#6b7280", fontFamily: "monospace" }}>
                    SKU: {label.sku}
                </div>
            )}
        </div>
    );
}

// ---- Helpers ----

function buildLabelList(
    products: BarcodeBatchPrintProps["products"],
    quantities: Record<string, number>
) {
    const labels: Array<{ name: string; price: number; barcode: string; sku: string }> = [];
    for (const product of products) {
        const qty = quantities[product.id] || 0;
        if (!product.barcode || qty === 0) continue;
        for (let i = 0; i < qty; i++) {
            labels.push({
                name: product.name,
                price: product.price,
                barcode: product.barcode,
                sku: product.sku || "",
            });
        }
    }
    return labels;
}
