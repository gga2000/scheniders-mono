"use client";

import { useEffect, useRef, useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
    GripVertical,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Lock,
    AlertTriangle,
    Palette,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type OrderReason,
    type ReasonKind,
    type ReasonUsage,
    REASON_COLORS,
    reasonColorDot,
    reasonUsageCount,
} from "@/lib/order-reasons";
import { useOrderReasonMutations } from "@/hooks/use-order-reasons";

type Accent = "rose" | "orange";

const ACCENT: Record<Accent, { ring: string; text: string; bg: string; addBorder: string; chip: string }> = {
    rose: {
        ring: "focus:ring-rose-400 dark:focus:ring-rose-500/50",
        text: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-500 hover:bg-rose-600",
        addBorder: "hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400",
        chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    },
    orange: {
        ring: "focus:ring-orange-400 dark:focus:ring-orange-500/50",
        text: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-500 hover:bg-orange-600",
        addBorder: "hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400",
        chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
    },
};

interface ReasonListEditorProps {
    kind: ReasonKind;
    reasons: OrderReason[];
    accent: Accent;
    /** Rename-safe usage analytics, optional. */
    usage?: ReasonUsage;
    /** When true the live data isn't available (shouldn't happen post-migration); edit UI replaced with a warning. */
    isFallback?: boolean;
}

export function ReasonListEditor({ kind, reasons, accent, usage, isFallback }: ReasonListEditorProps) {
    const a = ACCENT[accent];
    const { create, update, remove, reorder } = useOrderReasonMutations(kind);
    const [items, setItems] = useState<OrderReason[]>(reasons);
    const [addingAr, setAddingAr] = useState("");
    const [addingEn, setAddingEn] = useState("");

    const draggingRef = useRef(false);
    useEffect(() => {
        if (!draggingRef.current) setItems(reasons);
    }, [reasons]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function handleDragEnd(event: DragEndEvent) {
        draggingRef.current = false;
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const next = arrayMove(items, oldIndex, newIndex);
        setItems(next);
        reorder.mutate(next.map((i) => i.id));
    }

    function handleAdd() {
        const ar = addingAr.trim();
        if (!ar) return;
        const maxSort = Math.max(0, ...items.filter((i) => !i.is_system).map((i) => i.sort_order));
        create.mutate({ label_ar: ar, label_en: addingEn.trim() || null, sort_order: maxSort + 1 });
        setAddingAr("");
        setAddingEn("");
    }

    if (isFallback) {
        return (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                    التعديل غير مفعّل
                </div>
                <p className="mt-1 text-amber-700/90 dark:text-amber-200/80 leading-relaxed">
                    لم تُحمَّل أسباب من القاعدة لهذا المستأجر. اتصل بالدعم لإعداد الأسباب الافتراضية.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-muted/80 flex items-center gap-1">
                <Check className="w-3 h-3" />
                التغييرات تُحفظ تلقائياً
            </p>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => (draggingRef.current = true)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => (draggingRef.current = false)}
            >
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                        {items.map((reason) => (
                            <SortableReasonRow
                                key={reason.id}
                                reason={reason}
                                accent={a}
                                count={reasonUsageCount(usage, reason)}
                                onUpdate={(patch) => update.mutate({ id: reason.id, patch })}
                                onToggleActive={() =>
                                    update.mutate({ id: reason.id, patch: { is_active: !reason.is_active } })
                                }
                                onDelete={() => remove.mutate(reason.id)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <div className="flex items-center gap-2 pt-1">
                <input
                    value={addingAr}
                    onChange={(e) => setAddingAr(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="السبب بالعربية"
                    className={cn(
                        "flex-1 min-w-0 h-9 px-3 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:border-transparent",
                        a.ring,
                    )}
                />
                <input
                    value={addingEn}
                    onChange={(e) => setAddingEn(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="English (optional)"
                    className={cn(
                        "w-32 h-9 px-3 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-xs focus:outline-none focus:ring-2 focus:border-transparent",
                        a.ring,
                    )}
                />
                <button
                    onClick={handleAdd}
                    disabled={!addingAr.trim()}
                    className={cn(
                        "h-9 px-3 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        a.bg,
                    )}
                >
                    <Plus className="w-4 h-4" />
                    إضافة
                </button>
            </div>
        </div>
    );
}

interface RowProps {
    reason: OrderReason;
    accent: typeof ACCENT[Accent];
    count?: number;
    onUpdate: (patch: Partial<Pick<OrderReason, "label_ar" | "label_en" | "color" | "emoji" | "aliases">>) => void;
    onToggleActive: () => void;
    onDelete: () => void;
}

function SortableReasonRow({ reason, accent, count, onUpdate, onToggleActive, onDelete }: RowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reason.id });
    const [ar, setAr] = useState(reason.label_ar);
    const [en, setEn] = useState(reason.label_en ?? "");

    useEffect(() => setAr(reason.label_ar), [reason.label_ar]);
    useEffect(() => setEn(reason.label_en ?? ""), [reason.label_en]);

    const style: React.CSSProperties = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
    };

    const commitAr = () => {
        const v = ar.trim();
        if (v && v !== reason.label_ar) {
            const aliases = Array.from(new Set([...(reason.aliases ?? []), reason.label_ar])).filter(
                (x) => x && x !== v,
            );
            onUpdate({ label_ar: v, aliases });
        } else if (!v) {
            setAr(reason.label_ar);
        }
    };
    const commitEn = () => {
        const v = en.trim();
        if (v !== (reason.label_en ?? "")) onUpdate({ label_en: v || null });
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] group transition-shadow",
                isDragging && "shadow-lg ring-1 ring-black/5 z-10 relative",
                !reason.is_active && "opacity-60",
            )}
        >
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted/60 hover:text-muted touch-none p-1"
                aria-label="إعادة الترتيب"
            >
                <GripVertical className="w-4 h-4" />
            </button>

            <AppearanceControl reason={reason} onUpdate={onUpdate} />

            <input
                value={ar}
                onChange={(e) => setAr(e.target.value)}
                onBlur={commitAr}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="flex-1 min-w-0 h-8 px-2 rounded-md bg-transparent text-sm font-medium text-foreground focus:outline-none focus:bg-[var(--background)] hover:bg-[var(--background)] transition-colors"
            />
            <input
                value={en}
                onChange={(e) => setEn(e.target.value)}
                onBlur={commitEn}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="—"
                className="w-28 h-8 px-2 rounded-md bg-transparent text-xs text-muted focus:outline-none focus:bg-[var(--background)] hover:bg-[var(--background)] transition-colors text-left"
            />

            {typeof count === "number" && count > 0 && (
                <span className={cn("shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", accent.chip)}>
                    {count}
                </span>
            )}

            <button
                onClick={onToggleActive}
                title={reason.is_active ? "تعطيل" : "تفعيل"}
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted hover:bg-[var(--background)] transition-colors"
            >
                {reason.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {reason.is_system ? (
                <span
                    title="سبب أساسي — لا يمكن حذفه"
                    className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted/40"
                >
                    <Lock className="w-3.5 h-3.5" />
                </span>
            ) : (
                <button
                    onClick={onDelete}
                    title="حذف"
                    className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

function AppearanceControl({
    reason,
    onUpdate,
}: {
    reason: OrderReason;
    onUpdate: (patch: Partial<Pick<OrderReason, "color" | "emoji">>) => void;
}) {
    const [open, setOpen] = useState(false);
    const [emoji, setEmoji] = useState(reason.emoji ?? "");
    useEffect(() => setEmoji(reason.emoji ?? ""), [reason.emoji]);

    const dot = reasonColorDot(reason.color);

    const commitEmoji = () => {
        const v = emoji.trim().slice(0, 2);
        if (v !== (reason.emoji ?? "")) onUpdate({ emoji: v || null });
    };

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title="المظهر (رمز ولون)"
                className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-[var(--background)] transition-colors"
            >
                {reason.emoji ? (
                    <span className="text-base leading-none">{reason.emoji}</span>
                ) : dot ? (
                    <span className={cn("w-3.5 h-3.5 rounded-full", dot)} />
                ) : (
                    <Palette className="w-3.5 h-3.5" />
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute z-20 top-9 right-0 w-44 p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl space-y-2.5">
                        <input
                            value={emoji}
                            onChange={(e) => setEmoji(e.target.value)}
                            onBlur={commitEmoji}
                            placeholder="رمز تعبيري (emoji)"
                            className="w-full h-8 px-2 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none text-center"
                        />
                        <div className="grid grid-cols-4 gap-1.5">
                            {REASON_COLORS.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => {
                                        onUpdate({ color: reason.color === c.key ? null : c.key });
                                        setOpen(false);
                                    }}
                                    title={c.key}
                                    className={cn(
                                        "w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                                        c.dot,
                                        reason.color === c.key &&
                                            "ring-2 ring-offset-2 ring-offset-[var(--card-bg)] ring-foreground/40",
                                    )}
                                />
                            ))}
                        </div>
                        {(reason.color || reason.emoji) && (
                            <button
                                type="button"
                                onClick={() => {
                                    onUpdate({ color: null, emoji: null });
                                    setEmoji("");
                                    setOpen(false);
                                }}
                                className="w-full text-xs text-muted hover:text-foreground py-1 rounded-md hover:bg-[var(--background)] transition-colors"
                            >
                                مسح
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
