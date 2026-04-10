"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    X,
    RotateCcw,
    RotateCw,
    Crop,
    FlipHorizontal,
    FlipVertical2,
    Check,
} from "lucide-react";

interface ImageEditorModalProps {
    isOpen: boolean;
    imageUrl: string;
    onSave: (editedDataUrl: string) => void;
    onClose: () => void;
    productId?: string;
}

export function ImageEditorModal({ isOpen, imageUrl, onSave, onClose }: ImageEditorModalProps) {
    if (!isOpen) return null;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Source image (original for reset, current for after crops)
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [currentImage, setCurrentImage] = useState<HTMLImageElement | null>(null);

    // Transform state
    const [rotation, setRotation] = useState(0);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [saturation, setSaturation] = useState(100);

    // Crop state
    const [cropMode, setCropMode] = useState(false);
    const [isCropping, setIsCropping] = useState(false);
    const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
    const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);

    // ---- Load image when imageUrl changes ----
    useEffect(() => {
        if (!imageUrl) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            setOriginalImage(img);
            setCurrentImage(img);
            resetTransforms();
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // ---- Prevent body scroll while modal is open ----
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    // ---- Close on Escape ----
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (cropMode) {
                    cancelCrop();
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [cropMode, onClose]);

    // ---- Drawing function ----
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const img = currentImage;
        if (!canvas || !img) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const isRotated90 = rotation % 180 !== 0;
        const sourceW = isRotated90 ? img.height : img.width;
        const sourceH = isRotated90 ? img.width : img.height;

        // Scale to fit within preview area (max ~600x450)
        const maxW = 600;
        const maxH = 450;
        const scale = Math.min(maxW / sourceW, maxH / sourceH, 1);

        canvas.width = sourceW * scale;
        canvas.height = sourceH * scale;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Move origin to center for transforms
        ctx.translate(canvas.width / 2, canvas.height / 2);

        // Apply rotation
        ctx.rotate((rotation * Math.PI) / 180);

        // Apply flips
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

        // Apply filters
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

        // Draw image centered at origin
        const scaledW = img.width * scale;
        const scaledH = img.height * scale;
        ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

        ctx.restore();

        // Draw crop overlay
        if (cropMode && cropStart && cropEnd) {
            const x = Math.min(cropStart.x, cropEnd.x);
            const y = Math.min(cropStart.y, cropEnd.y);
            const w = Math.abs(cropEnd.x - cropStart.x);
            const h = Math.abs(cropEnd.y - cropStart.y);

            // Dim outside crop selection
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, canvas.width, y);
            ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
            ctx.fillRect(0, y, x, h);
            ctx.fillRect(x + w, y, canvas.width - x - w, h);

            // Dashed border around selection
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }
    }, [currentImage, rotation, flipH, flipV, brightness, contrast, saturation, cropMode, cropStart, cropEnd]);

    // Redraw whenever state changes
    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    // ---- Crop mouse handlers ----
    const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX)),
            y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY)),
        };
    }, []);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!cropMode) return;
            const coords = getCanvasCoords(e);
            if (!coords) return;
            setCropStart(coords);
            setCropEnd(null);
            setIsCropping(true);
        },
        [cropMode, getCanvasCoords]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!isCropping || !cropMode) return;
            const coords = getCanvasCoords(e);
            if (!coords) return;
            setCropEnd(coords);
        },
        [isCropping, cropMode, getCanvasCoords]
    );

    const handleMouseUp = useCallback(() => {
        setIsCropping(false);
    }, []);

    // ---- Crop apply / cancel ----
    const applyCrop = useCallback(() => {
        if (!cropStart || !cropEnd || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const x = Math.min(cropStart.x, cropEnd.x);
        const y = Math.min(cropStart.y, cropEnd.y);
        const w = Math.abs(cropEnd.x - cropStart.x);
        const h = Math.abs(cropEnd.y - cropStart.y);

        if (w < 10 || h < 10) return; // Selection too small

        // Grab the pixel data from the visible (non-overlay) portion.
        // We need to redraw without the overlay to get clean pixels.
        // Temporarily remove crop overlay by drawing without it.
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx || !currentImage) return;

        const img = currentImage;
        const isRotated90 = rotation % 180 !== 0;
        const sourceW = isRotated90 ? img.height : img.width;
        const sourceH = isRotated90 ? img.width : img.height;
        const scale = Math.min(600 / sourceW, 450 / sourceH, 1);

        tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
        tempCtx.rotate((rotation * Math.PI) / 180);
        tempCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        tempCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        const scaledW = img.width * scale;
        const scaledH = img.height * scale;
        tempCtx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

        // Now extract the crop region from the clean render
        const imageData = tempCtx.getImageData(x, y, w, h);

        // Create a new image from cropped data
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = w;
        cropCanvas.height = h;
        const cropCtx = cropCanvas.getContext("2d");
        if (!cropCtx) return;
        cropCtx.putImageData(imageData, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            setCurrentImage(newImg);
            // Reset transforms since the crop already baked them in
            setRotation(0);
            setFlipH(false);
            setFlipV(false);
            setBrightness(100);
            setContrast(100);
            setSaturation(100);
            setCropMode(false);
            setCropStart(null);
            setCropEnd(null);
        };
        newImg.src = cropCanvas.toDataURL();
    }, [cropStart, cropEnd, currentImage, rotation, flipH, flipV, brightness, contrast, saturation]);

    const cancelCrop = useCallback(() => {
        setCropMode(false);
        setCropStart(null);
        setCropEnd(null);
    }, []);

    // ---- Reset ----
    const resetTransforms = () => {
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
        setCropMode(false);
        setCropStart(null);
        setCropEnd(null);
    };

    const handleReset = () => {
        if (!originalImage) return;
        setCurrentImage(originalImage);
        resetTransforms();
    };

    // ---- Apply (save) ----
    const handleApply = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Ensure final render has no crop overlay
        // Draw one final clean pass at full resolution for output
        const img = currentImage;
        if (!img) return;

        const isRotated90 = rotation % 180 !== 0;
        const outW = isRotated90 ? img.height : img.width;
        const outH = isRotated90 ? img.width : img.height;

        const outCanvas = document.createElement("canvas");
        outCanvas.width = outW;
        outCanvas.height = outH;
        const ctx = outCanvas.getContext("2d");
        if (!ctx) return;

        ctx.translate(outW / 2, outH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);

        const dataUrl = outCanvas.toDataURL("image/jpeg", 0.9);
        onSave(dataUrl);
    };

    // ---- Toolbar buttons config ----
    const hasCropSelection = cropStart !== null && cropEnd !== null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-3xl bg-[var(--card-bg)] rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--card-border)]">
                    <h2 className="text-lg font-bold text-foreground">Image Editor</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                    >
                        <X className="w-5 h-5 text-muted" />
                    </button>
                </div>

                {/* Canvas preview */}
                <div
                    ref={previewContainerRef}
                    className="p-5 flex justify-center bg-[var(--background)]"
                >
                    <canvas
                        ref={canvasRef}
                        className="max-w-full rounded-xl shadow-inner"
                        style={{ cursor: cropMode ? "crosshair" : "default" }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>

                {/* Tool buttons */}
                <div className="flex flex-wrap items-center gap-2 px-5 pt-5 pb-3 border-t border-[var(--card-border)]">
                    <ToolButton
                        icon={<Crop className="w-4 h-4" />}
                        label="Crop"
                        active={cropMode}
                        onClick={() => {
                            if (cropMode) {
                                cancelCrop();
                            } else {
                                setCropMode(true);
                                setCropStart(null);
                                setCropEnd(null);
                            }
                        }}
                    />
                    <ToolButton
                        icon={<RotateCcw className="w-4 h-4" />}
                        label="Rotate L"
                        onClick={() => setRotation((r) => r - 90)}
                        disabled={cropMode}
                    />
                    <ToolButton
                        icon={<RotateCw className="w-4 h-4" />}
                        label="Rotate R"
                        onClick={() => setRotation((r) => r + 90)}
                        disabled={cropMode}
                    />
                    <ToolButton
                        icon={<FlipHorizontal className="w-4 h-4" />}
                        label="Flip H"
                        active={flipH}
                        onClick={() => setFlipH((f) => !f)}
                        disabled={cropMode}
                    />
                    <ToolButton
                        icon={<FlipVertical2 className="w-4 h-4" />}
                        label="Flip V"
                        active={flipV}
                        onClick={() => setFlipV((f) => !f)}
                        disabled={cropMode}
                    />

                    {/* Crop apply/cancel buttons */}
                    {cropMode && (
                        <div className="flex items-center gap-2 ml-auto">
                            {hasCropSelection && (
                                <button
                                    onClick={applyCrop}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-[var(--pastel-green)] text-green-800 rounded-xl text-sm font-medium hover:opacity-90 transition-colors"
                                >
                                    <Check className="w-4 h-4" />
                                    Apply
                                </button>
                            )}
                            <button
                                onClick={cancelCrop}
                                className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                {/* Adjustment sliders */}
                {!cropMode && (
                    <div className="px-5 pb-5 space-y-3">
                        <SliderControl
                            label="Brightness"
                            value={brightness}
                            onChange={setBrightness}
                        />
                        <SliderControl
                            label="Contrast"
                            value={contrast}
                            onChange={setContrast}
                        />
                        <SliderControl
                            label="Saturation"
                            value={saturation}
                            onChange={setSaturation}
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between p-5 border-t border-[var(--card-border)]">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all"
                        >
                            <Check className="w-4 h-4" />
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- Sub-components ----

function ToolButton({
    icon,
    label,
    active,
    disabled,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                    ? "bg-[var(--pastel-yellow)] text-amber-900"
                    : "bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)]"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            title={label}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function SliderControl({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground w-24 shrink-0">
                {label}
            </span>
            <input
                type="range"
                min={0}
                max={200}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-[var(--card-border)] rounded-full appearance-none cursor-pointer accent-[var(--ink)]"
            />
            <span className="text-xs text-muted w-10 text-right tabular-nums">
                {value}%
            </span>
        </div>
    );
}
