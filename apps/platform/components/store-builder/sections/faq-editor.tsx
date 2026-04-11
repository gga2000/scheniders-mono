"use client";

import { useCallback } from "react";
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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
    question: string;
    answer: string;
}

interface FaqEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
}

function SortableFaqItem({
    item,
    index,
    onUpdate,
    onRemove,
}: {
    item: FaqItem;
    index: number;
    onUpdate: (index: number, field: "question" | "answer", value: string) => void;
    onRemove: (index: number) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `faq-${index}`,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
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
                <input
                    type="text"
                    value={item.question}
                    onChange={(e) => onUpdate(index, "question", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="السؤال..."
                    dir="auto"
                />
                <textarea
                    value={item.answer}
                    onChange={(e) => onUpdate(index, "answer", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 rounded-lg border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="الجواب..."
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

export function FaqEditor({ data, onUpdate }: FaqEditorProps) {
    const items = (data.items as FaqItem[]) || [];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
                const oldIndex = Number((active.id as string).replace("faq-", ""));
                const newIndex = Number((over.id as string).replace("faq-", ""));
                onUpdate({ ...data, items: arrayMove(items, oldIndex, newIndex) });
            }
        },
        [data, items, onUpdate]
    );

    const handleUpdateItem = useCallback(
        (index: number, field: "question" | "answer", value: string) => {
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
        onUpdate({ ...data, items: [...items, { question: "", answer: "" }] });
    }, [data, items, onUpdate]);

    return (
        <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                    items={items.map((_, i) => `faq-${i}`)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {items.map((item, index) => (
                            <SortableFaqItem
                                key={`faq-${index}`}
                                item={item}
                                index={index}
                                onUpdate={handleUpdateItem}
                                onRemove={handleRemoveItem}
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
                Add Question
            </button>
        </div>
    );
}
