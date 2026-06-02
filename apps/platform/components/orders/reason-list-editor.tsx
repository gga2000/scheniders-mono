"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Check, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useOrderReasonMutations, type OrderReason, type ReasonKind } from "@/hooks/use-order-reasons";

/**
 * Inline editor for the rejection_reasons table.
 *
 * Supports: add, rename (Arabic + English), toggle active, reorder
 * (chevron up/down — keeps the bundle drag-free), delete. Used inside
 * the Order Reasons Manager settings panel.
 *
 * NOTE: cancellation reasons (kind="cancel") aren't yet a separate table
 * in mono — until that's added, only kind="reject" is fully wired.
 */
export function ReasonListEditor({
    kind,
    reasons,
    accent,
}: {
    kind: ReasonKind;
    reasons: OrderReason[];
    accent: "rose" | "orange";
}) {
    const { create, update, remove, reorder } = useOrderReasonMutations(kind);
    const [newAr, setNewAr] = useState("");
    const [newEn, setNewEn] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAr, setEditAr] = useState("");
    const [editEn, setEditEn] = useState("");

    const accentClass = accent === "rose" ? "bg-rose-500" : "bg-orange-500";
    const accentLight = accent === "rose" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-orange-50 text-orange-700 border-orange-200";

    const handleAdd = () => {
        const label_ar = newAr.trim();
        if (!label_ar) {
            toast.error("Arabic label is required");
            return;
        }
        const nextSortOrder = (reasons[reasons.length - 1]?.sort_order ?? 0) + 1;
        create.mutate(
            { label_ar, label_en: newEn.trim() || null, sort_order: nextSortOrder },
            {
                onSuccess: () => {
                    setNewAr("");
                    setNewEn("");
                    toast.success("Reason added");
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add"),
            }
        );
    };

    const handleStartEdit = (r: OrderReason) => {
        setEditingId(r.id);
        setEditAr(r.label_ar);
        setEditEn(r.label_en || "");
    };

    const handleSaveEdit = (id: string) => {
        const label_ar = editAr.trim();
        if (!label_ar) {
            toast.error("Arabic label is required");
            return;
        }
        update.mutate(
            { id, patch: { label_ar, label_en: editEn.trim() || null } },
            {
                onSuccess: () => {
                    setEditingId(null);
                    toast.success("Reason updated");
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update"),
            }
        );
    };

    const handleToggleActive = (r: OrderReason) => {
        update.mutate(
            { id: r.id, patch: { is_active: !r.is_active } },
            { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update") }
        );
    };

    const handleDelete = (r: OrderReason) => {
        if (!confirm(`Delete "${r.label_ar}"? This cannot be undone.`)) return;
        remove.mutate(r.id, {
            onSuccess: () => toast.success("Reason deleted"),
            onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete"),
        });
    };

    const handleMove = (index: number, direction: -1 | 1) => {
        const next = index + direction;
        if (next < 0 || next >= reasons.length) return;
        const ids = reasons.map((r) => r.id);
        [ids[index], ids[next]] = [ids[next], ids[index]];
        reorder.mutate(ids);
    };

    return (
        <div className="space-y-3" dir="rtl">
            {/* Existing reasons */}
            <div className="space-y-2">
                {reasons.length === 0 ? (
                    <p className="text-sm text-muted text-center py-6">لا توجد أسباب بعد. أضف أول سبب أدناه.</p>
                ) : (
                    reasons.map((r, idx) => {
                        const isEditing = editingId === r.id;
                        return (
                            <div
                                key={r.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-xl border bg-background px-3 py-2",
                                    r.is_active ? "border-[var(--card-border)]" : "border-dashed border-[var(--card-border)] opacity-60"
                                )}
                            >
                                {/* Reorder */}
                                <div className="flex flex-col">
                                    <button
                                        onClick={() => handleMove(idx, -1)}
                                        disabled={idx === 0}
                                        className="h-4 w-4 inline-flex items-center justify-center text-muted hover:text-foreground disabled:opacity-30"
                                        title="Move up"
                                    >
                                        <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => handleMove(idx, 1)}
                                        disabled={idx === reasons.length - 1}
                                        className="h-4 w-4 inline-flex items-center justify-center text-muted hover:text-foreground disabled:opacity-30"
                                        title="Move down"
                                    >
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                </div>

                                {/* Sort order pill */}
                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", accentLight)}>
                                    {r.sort_order}
                                </span>

                                {/* Labels (display or edit) */}
                                <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                value={editAr}
                                                onChange={(e) => setEditAr(e.target.value)}
                                                placeholder="Arabic"
                                                className="h-8 px-2 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-sm"
                                            />
                                            <input
                                                value={editEn}
                                                onChange={(e) => setEditEn(e.target.value)}
                                                placeholder="English (optional)"
                                                className="h-8 px-2 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-sm"
                                                dir="ltr"
                                            />
                                        </div>
                                    ) : (
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">{r.label_ar}</p>
                                            {r.label_en && <p className="text-xs text-muted truncate" dir="ltr">{r.label_en}</p>}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    {isEditing ? (
                                        <>
                                            <button
                                                onClick={() => handleSaveEdit(r.id)}
                                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                                                title="Save"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:bg-muted/30"
                                                title="Cancel"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleStartEdit(r)}
                                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted/30"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(r)}
                                                className={cn(
                                                    "h-7 px-2 inline-flex items-center justify-center rounded-md text-[10px] font-bold",
                                                    r.is_active
                                                        ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                                        : "text-muted bg-muted/30 hover:bg-muted/50"
                                                )}
                                                title={r.is_active ? "Active — click to disable" : "Disabled — click to enable"}
                                            >
                                                {r.is_active ? "ON" : "OFF"}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(r)}
                                                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add new */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-2 border-t border-[var(--card-border)]">
                <input
                    value={newAr}
                    onChange={(e) => setNewAr(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="السبب بالعربي"
                    className="h-9 px-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-sm"
                />
                <input
                    value={newEn}
                    onChange={(e) => setNewEn(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="English (optional)"
                    className="h-9 px-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-sm"
                    dir="ltr"
                />
                <button
                    onClick={handleAdd}
                    disabled={create.isPending || !newAr.trim()}
                    className={cn(
                        "h-9 px-3 rounded-lg text-white text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50 transition-opacity",
                        accentClass
                    )}
                >
                    <Plus className="w-4 h-4" /> Add
                </button>
            </div>
        </div>
    );
}
