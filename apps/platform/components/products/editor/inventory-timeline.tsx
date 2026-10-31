"use client";

import { useState } from "react";
import {
    History,
    Plus,
    Trash2,
    PackagePlus,
    ShoppingCart,
    RotateCcw,
    SlidersHorizontal,
    Lock,
    AlertTriangle,
    ClipboardCheck,
    PackageOpen,
} from "lucide-react";

export interface InventoryHistoryFormData {
    change_type: (typeof HISTORY_TYPES)[number];
    quantity_change: number;
    quantity_before: number;
    quantity_after: number;
    reference_id?: string;
    notes?: string;
    changed_by?: string;
    created_at?: string;
}

interface InventoryTimelineProps {
    entries: InventoryHistoryFormData[];
    onChange: (entries: InventoryHistoryFormData[]) => void;
}

/** Entries a person can add here by hand. */
const CHANGE_TYPES = ["received", "sold", "returned", "adjusted", "reserved", "quarantined"] as const;
/** Every type the log holds: shelf counts are written by the stock count RPCs. */
const HISTORY_TYPES = [...CHANGE_TYPES, "count", "open_box_count"] as const;

const typeLabel = (type: string) => (type === "open_box_count" ? "Open box count" : type.charAt(0).toUpperCase() + type.slice(1));

const TYPE_CONFIG: Record<
    InventoryHistoryFormData["change_type"],
    {
        icon: typeof History;
        bgClass: string;
        textClass: string;
        badgeBg: string;
        badgeText: string;
    }
> = {
    received: {
        icon: PackagePlus,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700",
        badgeBg: "bg-[var(--pastel-green)]",
        badgeText: "text-green-700",
    },
    sold: {
        icon: ShoppingCart,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        badgeBg: "bg-[var(--pastel-blue)]",
        badgeText: "text-blue-700",
    },
    returned: {
        icon: RotateCcw,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700",
        badgeBg: "bg-[var(--pastel-yellow)]",
        badgeText: "text-yellow-700",
    },
    adjusted: {
        icon: SlidersHorizontal,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700",
        badgeBg: "bg-[var(--pastel-pink)]",
        badgeText: "text-pink-700",
    },
    reserved: {
        icon: Lock,
        bgClass: "bg-[var(--pastel-mint)]",
        textClass: "text-teal-700",
        badgeBg: "bg-[var(--pastel-mint)]",
        badgeText: "text-teal-700",
    },
    quarantined: {
        icon: AlertTriangle,
        bgClass: "bg-rose-100",
        textClass: "text-rose-700",
        badgeBg: "bg-rose-100",
        badgeText: "text-rose-700",
    },
    count: {
        icon: ClipboardCheck,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        badgeBg: "bg-[var(--pastel-blue)]",
        badgeText: "text-blue-700",
    },
    open_box_count: {
        icon: PackageOpen,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700",
        badgeBg: "bg-[var(--pastel-yellow)]",
        badgeText: "text-yellow-700",
    },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return "";
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function formatQuantityChange(value: number): { text: string; colorClass: string } {
    if (value >= 0) {
        return { text: `+${value}`, colorClass: "text-green-600" };
    }
    return { text: `${value}`, colorClass: "text-red-600" };
}

interface NewEntryForm {
    change_type: InventoryHistoryFormData["change_type"];
    quantity_change: string;
    notes: string;
    changed_by: string;
    reference_id: string;
}

const INITIAL_FORM: NewEntryForm = {
    change_type: "received",
    quantity_change: "",
    notes: "",
    changed_by: "",
    reference_id: "",
};

export function InventoryTimeline({ entries, onChange }: InventoryTimelineProps) {
    const [filter, setFilter] = useState<InventoryHistoryFormData["change_type"] | "all">("all");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<NewEntryForm>(INITIAL_FORM);

    const filteredEntries =
        filter === "all" ? entries : entries.filter((e) => e.change_type === filter);

    const typeCounts: Record<string, number> = { all: entries.length };
    for (const t of HISTORY_TYPES) {
        typeCounts[t] = entries.filter((e) => e.change_type === t).length;
    }

    function handleDelete(index: number) {
        const entryToDelete = filteredEntries[index];
        const originalIndex = entries.indexOf(entryToDelete);
        if (originalIndex === -1) return;
        const next = [...entries];
        next.splice(originalIndex, 1);
        onChange(next);
    }

    function handleSave() {
        const quantityChange = parseInt(form.quantity_change) || 0;
        const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
        const quantityBefore = lastEntry ? lastEntry.quantity_after : 0;
        const quantityAfter = quantityBefore + quantityChange;

        const newEntry: InventoryHistoryFormData = {
            change_type: form.change_type,
            quantity_change: quantityChange,
            quantity_before: quantityBefore,
            quantity_after: quantityAfter,
            created_at: new Date().toISOString(),
            ...(form.notes ? { notes: form.notes } : {}),
            ...(form.changed_by ? { changed_by: form.changed_by } : {}),
            ...(form.reference_id ? { reference_id: form.reference_id } : {}),
        };

        onChange([...entries, newEntry]);
        setForm(INITIAL_FORM);
        setShowForm(false);
    }

    function handleCancel() {
        setForm(INITIAL_FORM);
        setShowForm(false);
    }

    const inputClass =
        "w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-blue)] transition-all text-sm";

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Entry
                </button>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-1.5">
                {(["all", ...HISTORY_TYPES] as const).map((type) => {
                    const isActive = filter === type;
                    const count = typeCounts[type] ?? 0;
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setFilter(type)}
                            className={
                                isActive
                                    ? "px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium"
                                    : "px-3 py-1.5 text-muted hover:text-foreground rounded-lg text-sm transition-colors"
                            }
                        >
                            {type === "all" ? "All" : typeLabel(type)}
                            <span className="ml-1.5 text-xs opacity-70">{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Add Entry Form */}
            {showForm && (
                <div className="p-4 bg-[var(--pastel-blue)]/30 rounded-xl border border-blue-200 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Change Type
                            </label>
                            <select
                                value={form.change_type}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        change_type: e.target.value as InventoryHistoryFormData["change_type"],
                                    })
                                }
                                className={inputClass}
                            >
                                {CHANGE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Quantity Change
                            </label>
                            <input
                                type="number"
                                value={form.quantity_change}
                                onChange={(e) => setForm({ ...form, quantity_change: e.target.value })}
                                placeholder="e.g. 50 or -10"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                            Notes
                        </label>
                        <input
                            type="text"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            placeholder="Optional notes..."
                            className={inputClass}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Changed By
                            </label>
                            <input
                                type="text"
                                value={form.changed_by}
                                onChange={(e) => setForm({ ...form, changed_by: e.target.value })}
                                placeholder="Name or email..."
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Reference
                            </label>
                            <input
                                type="text"
                                value={form.reference_id}
                                onChange={(e) => setForm({ ...form, reference_id: e.target.value })}
                                placeholder="Order ID, PO number..."
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Preview calculated values */}
                    {form.quantity_change && (
                        <div className="text-xs text-muted px-1">
                            Before: {entries.length > 0 ? entries[entries.length - 1].quantity_after : 0}{" "}
                            → After:{" "}
                            {(entries.length > 0 ? entries[entries.length - 1].quantity_after : 0) +
                                (parseInt(form.quantity_change) || 0)}
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-4 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="px-4 py-1.5 text-muted hover:text-foreground rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {entries.length === 0 && !showForm && (
                <p className="text-sm text-muted py-4 text-center">
                    No inventory history entries. Stock changes will be tracked here.
                </p>
            )}

            {/* Timeline */}
            {filteredEntries.length > 0 && (
                <div className="relative pl-8 before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--card-border)]">
                    <div className="space-y-4">
                        {filteredEntries.map((entry, idx) => {
                            const config = TYPE_CONFIG[entry.change_type];
                            const Icon = config.icon;
                            const qty = formatQuantityChange(entry.quantity_change);

                            return (
                                <div key={idx} className="relative">
                                    {/* Timeline node circle */}
                                    <div
                                        className={`absolute left-0 w-7 h-7 rounded-full flex items-center justify-center -translate-x-[calc(100%+0.25rem)] ${config.bgClass}`}
                                        style={{ left: "-0.5rem" }}
                                    >
                                        <Icon className={`w-3.5 h-3.5 ${config.textClass}`} />
                                    </div>

                                    {/* Content card */}
                                    <div className="ml-2 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] relative group">
                                        {/* Top row */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeBg} ${config.badgeText}`}
                                            >
                                                {typeLabel(entry.change_type)}
                                            </span>
                                            <span className={`font-mono font-bold text-sm ${qty.colorClass}`}>
                                                {qty.text}
                                            </span>
                                            {entry.created_at && (
                                                <span className="text-xs text-muted ml-auto">
                                                    {formatDate(entry.created_at)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Before -> After */}
                                        <p className="text-sm text-muted mt-1">
                                            Before: {entry.quantity_before} → After: {entry.quantity_after}
                                        </p>

                                        {/* Bottom details */}
                                        {(entry.notes || entry.changed_by || entry.reference_id) && (
                                            <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                {entry.notes && (
                                                    <span className="text-sm text-muted italic">
                                                        {entry.notes}
                                                    </span>
                                                )}
                                                {entry.changed_by && (
                                                    <span className="px-2 py-0.5 bg-[var(--card-border)] rounded-full text-xs text-muted">
                                                        {entry.changed_by}
                                                    </span>
                                                )}
                                                {entry.reference_id && (
                                                    <span className="text-xs text-blue-600 underline underline-offset-2 cursor-pointer">
                                                        {entry.reference_id}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Delete button */}
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(idx)}
                                            className="absolute top-2 right-2 p-1 text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filtered empty state */}
            {filteredEntries.length === 0 && entries.length > 0 && (
                <p className="text-sm text-muted py-4 text-center">
                    No entries match the selected filter.
                </p>
            )}
        </div>
    );
}
