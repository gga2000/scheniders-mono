"use client";

import { useState, useRef } from "react";
import { Plus, X, GripVertical, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";
import {
    useProductImagesQuery,
    useAddProductImageMutation,
    useUpdateProductImageMutation,
    useDeleteProductImageMutation,
    useReorderProductImagesMutation,
    useProductGalleryUrlsQuery,
    useRemoveProductGalleryUrlMutation,
    ProductImage
} from "@/hooks/use-product-images-query";
import { useLanguage } from "@/hooks/use-language";

interface ProductGallerySectionProps {
    productId?: string;
}

export function ProductGallerySection({ productId }: ProductGallerySectionProps) {
    const { t } = useLanguage();
    const { data: images = [], isLoading } = useProductImagesQuery(productId);
    const { data: galleryUrls = [] } = useProductGalleryUrlsQuery(productId);
    const addImageMutation = useAddProductImageMutation();
    const updateImageMutation = useUpdateProductImageMutation();
    const deleteImageMutation = useDeleteProductImageMutation();
    const reorderMutation = useReorderProductImagesMutation();
    const removeGalleryUrlMutation = useRemoveProductGalleryUrlMutation();

    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = images.findIndex((img) => img.id === active.id);
            const newIndex = images.findIndex((img) => img.id === over.id);
            const newOrderArray = arrayMove(images, oldIndex, newIndex);
            
            const updates = newOrderArray.map((img, index) => ({
                id: img.id,
                display_order: index,
            }));
            
            if (productId) {
                 reorderMutation.mutate({ productId, items: updates });
            }
        }
    };

    const uploadFile = async (file: File) => {
        if (!productId) {
            toast.error(t("products.ed.gallery.saveFirst"));
            return;
        }
        if (!file.type.startsWith("image/")) {
            toast.error(t("products.ed.gallery.onlyImages"));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t("products.ed.gallery.tooBig"));
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const fileName = `gallery/${productId}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(fileName, file, {
                    cacheControl: "3600",
                    upsert: true,
                });

            if (uploadError) {
                toast.error(t("products.ed.gallery.uploadFailed"), uploadError.message);
                throw uploadError;
            }

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(fileName);

            await addImageMutation.mutateAsync({
                product_id: productId,
                image_url: urlData.publicUrl,
                alt_text: "",
                display_order: images.length,
            });
            toast.success(t("products.ed.gallery.added"));
        } catch (err) {
            console.error("Failed to upload gallery image", err);
            const e = err as { message?: string; code?: string; details?: string; hint?: string };
            const message = e?.message || e?.details || e?.hint || JSON.stringify(err);
            toast.error(t("products.ed.gallery.addFailed"), e?.code ? `[${e.code}] ${message}` : message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0]);
        }
    };

    if (!productId) {
        return (
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">{t("products.ed.gallery.title")}</h3>
                <div className="p-6 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <p className="text-muted text-sm">{t("products.ed.gallery.saveFirstShort")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">{t("products.ed.gallery.title")}</h3>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors disabled:opacity-50"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t("products.ed.gallery.add")}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>

            {isLoading ? (
                 <div className="flex justify-center p-8">
                     <Loader2 className="w-6 h-6 text-muted animate-spin" />
                 </div>
            ) : images.length === 0 ? (
                <div className="p-6 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <p className="text-muted text-sm">{t("products.ed.gallery.empty")}</p>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {images.map((image) => (
                                <SortableImageItem 
                                    key={image.id} 
                                    image={image} 
                                    onUpdate={(alt) => updateImageMutation.mutate({ id: image.id, data: { alt_text: alt } })}
                                    onDelete={() => deleteImageMutation.mutate({ id: image.id, imageUrl: image.image_url })}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {/* Imported gallery (products.gallery_urls) — photos migrated with
                the product (old-site catalog). They render in the storefront
                gallery after the managed images above. External URLs we don't
                host, so removal only edits the list — no storage delete. */}
            {galleryUrls.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">{t("products.ed.gallery.imported")}</h4>
                        <span className="text-xs text-muted">({galleryUrls.length})</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {galleryUrls.map((url, i) => (
                            <div
                                key={`${i}-${url}`}
                                className="group relative p-2 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                            >
                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted/20">
                                    <img
                                        src={url}
                                        alt={t("products.ed.gallery.importedAlt")}
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-x-0 top-0 p-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/50 to-transparent">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!productId) return;
                                                removeGalleryUrlMutation.mutate(
                                                    { productId, url },
                                                    {
                                                        onSuccess: () => toast.success(t("products.ed.gallery.removed")),
                                                        onError: (err) => {
                                                            console.error("Failed to remove imported photo", err);
                                                            toast.error(t("products.ed.gallery.removeFailed"));
                                                        },
                                                    },
                                                );
                                            }}
                                            disabled={removeGalleryUrlMutation.isPending}
                                            className="p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 rounded-lg backdrop-blur-sm transition-colors disabled:opacity-50"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SortableImageItem({ 
    image, 
    onUpdate, 
    onDelete 
}: { 
    image: ProductImage; 
    onUpdate: (alt: string) => void; 
    onDelete: () => void;
}) {
    const { t } = useLanguage();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: image.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group relative p-2 bg-[var(--background)] rounded-xl border ${isDragging ? 'border-[var(--pastel-yellow)] shadow-lg scale-105' : 'border-[var(--card-border)]'} transition-all`}
        >
            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted/20 mb-2">
                <img
                    src={image.image_url}
                    alt={image.alt_text || t("products.ed.gallery.galleryAlt")}
                    className="w-full h-full object-cover"
                />
                
                {/* Overlay actions */}
                <div className="absolute inset-x-0 top-0 p-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/50 to-transparent">
                     <button
                        {...attributes}
                        {...listeners}
                        type="button"
                        className="p-1.5 text-white hover:bg-white/20 rounded-lg cursor-grab active:cursor-grabbing backdrop-blur-sm"
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 rounded-lg backdrop-blur-sm transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <input
                type="text"
                placeholder={t("products.ed.gallery.alt")}
                defaultValue={image.alt_text || ""}
                onBlur={(e) => onUpdate(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        onUpdate(e.currentTarget.value);
                        e.currentTarget.blur();
                    }
                }}
                className="w-full px-2 py-1.5 text-xs bg-[var(--background)] border border-transparent hover:border-[var(--card-border)] focus:border-[var(--pastel-yellow)] rounded text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none transition-all"
            />
        </div>
    );
}
