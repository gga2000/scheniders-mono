"use client";

import { useState } from "react";
import { Image as ImageIcon, Pencil } from "lucide-react";
import { ProductImageUpload } from "../product-image-upload";
import { ProductGallerySection } from "../product-gallery-section";
import { ImageEditorModal } from "./image-editor-modal";
import { uploadProductImage } from "@/lib/upload-product-image";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useLanguage } from "@/hooks/use-language";

interface ProductMediaSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    productId?: string;
}

export function ProductMediaSection({ formData, updateField, productId }: ProductMediaSectionProps) {
    const [editorOpen, setEditorOpen] = useState(false);
    const { t } = useLanguage();

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    {t("products.ed.media")}
                </h2>
                {formData.image_url && (
                    <button
                        type="button"
                        onClick={() => setEditorOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        {t("products.ed.editImage")}
                    </button>
                )}
            </div>

            <ProductImageUpload
                value={formData.image_url}
                onChange={(url) => updateField("image_url", url)}
                productId={productId}
            />

            {!formData.is_supply && productId && (
                <div className="pt-2">
                    <ProductGallerySection productId={productId} />
                </div>
            )}

            {editorOpen && (
                <ImageEditorModal
                    onClose={() => setEditorOpen(false)}
                    imageUrl={formData.image_url}
                    onSave={async (edited) => {
                        updateField("image_url", await uploadProductImage(edited, productId));
                        setEditorOpen(false);
                    }}
                />
            )}
        </div>
    );
}
