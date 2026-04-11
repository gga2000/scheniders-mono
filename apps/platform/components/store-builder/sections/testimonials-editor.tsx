"use client";

import { useState, useCallback, useRef } from "react";
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
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Star, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface TestimonialItem {
    name: string;
    photo: string | null;
    rating: number;
    quote: string;
}

interface TestimonialsEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
    tenantId: string;
}

// ── Star Rating ──

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    className="p-0.5"
                >
                    <Star
                        className={cn(
                            "w-4 h-4 transition-colors",
                            star <= value
                                ? "fill-amber-400 text-amber-400"
                                : "text-gray-300"
                        )}
                    />
                </button>
            ))}
        </div>
    );
}

// ── Sortable Testimonial Item ──

function SortableTestimonialItem({
    item,
    index,
    onUpdate,
    onRemove,
    tenantId,
}: {
    item: TestimonialItem;
    index: number;
    onUpdate: (index: number, field: keyof TestimonialItem, value: string | number | null) => void;
    onRemove: (index: number) => void;
    tenantId: string;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `testimonial-${index}`,
    });
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handlePhotoUpload = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Photo must be under 2MB");
            return;
        }
        setUploading(true);
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${tenantId}/testimonial-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from("tenant-assets")
            .upload(path, file, { cacheControl: "3600", upsert: true });
        if (error) {
            toast.error("Upload failed");
            setUploading(false);
            return;
        }
        const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
        onUpdate(index, "photo", urlData.publicUrl);
        setUploading(false);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex gap-2 p-3 rounded-xl border border-(--card-border) bg-background",
                isDragging && "shadow-lg opacity-90 z-10"
            )}
        >
            <button
                type="button"
                className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground mt-2"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="w-4 h-4" />
            </button>

            <div className="flex-1 space-y-2">
                <div className="flex items-start gap-3">
                    {/* Photo */}
                    <div className="shrink-0">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(file);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="w-10 h-10 rounded-full border border-(--card-border) overflow-hidden flex items-center justify-center bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                            {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : item.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.photo} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                        </button>
                    </div>

                    <div className="flex-1 space-y-1.5">
                        <input
                            type="text"
                            value={item.name}
                            onChange={(e) => onUpdate(index, "name", e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="اسم العميل"
                            dir="auto"
                        />
                        <StarRating
                            value={item.rating}
                            onChange={(v) => onUpdate(index, "rating", v)}
                        />
                    </div>
                </div>

                <textarea
                    value={item.quote}
                    onChange={(e) => onUpdate(index, "quote", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 rounded-lg border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="رأي العميل..."
                    dir="auto"
                />
            </div>

            <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-1 h-fit mt-2 text-muted-foreground hover:text-red-500 transition-colors"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ── Main ──

export function TestimonialsEditor({ data, onUpdate, tenantId }: TestimonialsEditorProps) {
    const items = (data.items as TestimonialItem[]) || [];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
                const oldIndex = Number((active.id as string).replace("testimonial-", ""));
                const newIndex = Number((over.id as string).replace("testimonial-", ""));
                onUpdate({ ...data, items: arrayMove(items, oldIndex, newIndex) });
            }
        },
        [data, items, onUpdate]
    );

    const handleUpdateItem = useCallback(
        (index: number, field: keyof TestimonialItem, value: string | number | null) => {
            const newItems = [...items];
            newItems[index] = { ...newItems[index], [field]: value };
            onUpdate({ ...data, items: newItems });
        },
        [data, items, onUpdate]
    );

    const handleRemoveItem = useCallback(
        (index: number) => {
            onUpdate({ ...data, items: items.filter((_, i) => i !== index) });
        },
        [data, items, onUpdate]
    );

    const handleAddItem = useCallback(() => {
        onUpdate({
            ...data,
            items: [...items, { name: "", photo: null, rating: 5, quote: "" }],
        });
    }, [data, items, onUpdate]);

    return (
        <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                    items={items.map((_, i) => `testimonial-${i}`)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {items.map((item, index) => (
                            <SortableTestimonialItem
                                key={`testimonial-${index}`}
                                item={item}
                                index={index}
                                onUpdate={handleUpdateItem}
                                onRemove={handleRemoveItem}
                                tenantId={tenantId}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <button
                type="button"
                onClick={handleAddItem}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-(--card-border) text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
                <Plus className="w-3.5 h-3.5" />
                Add Testimonial
            </button>
        </div>
    );
}
