"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, GripVertical, Image as ImageIcon, Loader2 } from "lucide-react";
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
    ProductImage
} from "@/hooks/use-product-images-query";

interface ProductGallerySectionProps {
    productId?: string;
}

export function ProductGallerySection({ productId }: ProductGallerySectionProps) {
    const { data: images = [], isLoading } = useProductImagesQuery(productId);
    const addImageMutation = useAddProductImageMutation();
    const updateImageMutation = useUpdateProductImageMutation();
    const deleteImageMutation = useDeleteProductImageMutation();
    const reorderMutation = useReorderProductImagesMutation();

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
        if (!productId) return;
        if (!file.type.startsWith("image/")) return;

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

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(fileName);

            await addImageMutation.mutateAsync({
                product_id: productId,
                image_url: urlData.publicUrl,
                alt_text: "",
                display_order: images.length,
            });
        } catch (err) {
            console.error("Failed to upload gallery image", err);
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
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Gallery</h3>
                <div className="p-6 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <p className="text-muted text-sm">Save the product first to add gallery images</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Gallery</h3>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors disabled:opacity-50"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Image
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
                    <p className="text-muted text-sm">No secondary images added to this product.</p>
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
                    alt={image.alt_text || "Gallery image"}
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
                placeholder="Alt text..."
                defaultValue={image.alt_text || ""}
                onBlur={(e) => onUpdate(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        onUpdate(e.currentTarget.value);
                        e.currentTarget.blur();
                    }
                }}
                className="w-full px-2 py-1.5 text-xs bg-[var(--background)] border border-transparent hover:border-[var(--card-border)] focus:border-[var(--pastel-yellow)] rounded text-foreground placeholder:text-muted focus:outline-none transition-all"
            />
        </div>
    );
}
