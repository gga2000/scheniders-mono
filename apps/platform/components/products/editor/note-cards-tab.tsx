"use client";

import { useRef, useState } from "react";
import { StickyNote, Plus, Trash2, ArrowUp, ArrowDown, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { NoteCardFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

// Re-exported so ProductCMSTabs can import the row type from its tab file.
export type { NoteCardFormData } from "@/hooks/use-product-editor";

interface NoteCardsTabProps {
    noteCards: NoteCardFormData[];
    onChange: (noteCards: NoteCardFormData[]) => void;
    /** Undefined in create mode — uploads then land under a temp prefix,
     *  same as the main product image upload. */
    productId?: string;
}

/**
 * Editor for `products.feature_cards` (jsonb) — the "note highlight" cards the
 * storefront funnel PDP renders under the buy box. Empty list = feature off.
 * Cards without a title are stripped on save (see use-product-editor).
 */
export function NoteCardsTab({ noteCards, onChange, productId }: NoteCardsTabProps) {
    const { t } = useLanguage();
    const addCard = () => {
        onChange([...noteCards, { image_url: "", title: "", body: "" }]);
    };

    const updateCard = (index: number, updates: Partial<NoteCardFormData>) => {
        onChange(noteCards.map((c, i) => (i === index ? { ...c, ...updates } : c)));
    };

    const removeCard = (index: number) => {
        onChange(noteCards.filter((_, i) => i !== index));
    };

    const moveCard = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= noteCards.length) return;
        const next = [...noteCards];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                    {t("products.notes.hint")}
                </p>
                <button
                    type="button"
                    onClick={addCard}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.notes.add")}
                </button>
            </div>

            {/* Empty state */}
            {noteCards.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <StickyNote className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No note cards added. Tell customers what makes this product special — each card gets a title, a short note, and an optional photo.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {noteCards.map((card, index) => (
                        <NoteCardRow
                            key={index}
                            card={card}
                            index={index}
                            total={noteCards.length}
                            productId={productId}
                            onUpdate={(updates) => updateCard(index, updates)}
                            onRemove={() => removeCard(index)}
                            onMove={(direction) => moveCard(index, direction)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function NoteCardRow({
    card,
    index,
    total,
    productId,
    onUpdate,
    onRemove,
    onMove,
}: {
    card: NoteCardFormData;
    index: number;
    total: number;
    productId?: string;
    onUpdate: (updates: Partial<NoteCardFormData>) => void;
    onRemove: () => void;
    onMove: (direction: -1 | 1) => void;
}) {
    const { t } = useLanguage();
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            setUploadError("Only image files are allowed");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setUploadError("Image must be under 5MB");
            return;
        }

        setUploading(true);
        setUploadError(null);
        try {
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
            // Same bucket + prefixing pattern as the gallery / main image uploads.
            const filePath = `note-cards/${productId || "temp"}/${Date.now()}.${fileExt}`;

            const { error } = await supabase.storage
                .from("product-images")
                .upload(filePath, file, { cacheControl: "3600", upsert: true });
            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(filePath);
            onUpdate({ image_url: urlData.publicUrl });
        } catch (err) {
            console.error("Failed to upload note card image", err);
            setUploadError(err instanceof Error ? err.message : "Failed to upload image");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4">
            <div className="flex gap-3">
                {/* Image slot */}
                <div className="shrink-0">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) uploadFile(e.target.files[0]);
                        }}
                    />
                    {card.image_url ? (
                        <div className="group relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--card-border)] bg-muted/20">
                            <img
                                src={card.image_url}
                                alt={card.title || "Note card image"}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    title={t("products.notes.replaceImage")}
                                    className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUpdate({ image_url: "" })}
                                    title={t("products.notes.removeImage")}
                                    className="p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-20 h-20 rounded-lg border border-dashed border-[var(--card-border)] flex flex-col items-center justify-center gap-1 text-muted hover:text-foreground hover:border-[var(--ink)]/50 transition-colors disabled:opacity-50"
                        >
                            {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span className="text-[10px]">{t("products.notes.image")}</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Title + body */}
                <div className="flex-1 min-w-0 space-y-2">
                    <input
                        type="text"
                        value={card.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        placeholder={t("products.notes.titlePh")}
                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                    <textarea
                        value={card.body}
                        onChange={(e) => onUpdate({ body: e.target.value })}
                        placeholder={t("products.notes.textPh")}
                        rows={2}
                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] resize-none"
                    />
                    {uploadError && (
                        <p className="text-xs text-rose-600 flex items-center gap-1.5">
                            <X className="w-3 h-3" />
                            {uploadError}
                        </p>
                    )}
                </div>

                {/* Reorder + delete */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => onMove(-1)}
                        disabled={index === 0}
                        title={t("products.notes.moveUp")}
                        className="p-1.5 text-muted hover:text-foreground hover:bg-[var(--card-border)] rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(1)}
                        disabled={index === total - 1}
                        title={t("products.notes.moveDown")}
                        className="p-1.5 text-muted hover:text-foreground hover:bg-[var(--card-border)] rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        title={t("products.notes.remove")}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
