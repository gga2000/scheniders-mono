"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { EASE_CHROME } from "@/lib/animation-constants";
import {
  useIndustries,
  useCreateIndustry,
  useUpdateIndustry,
  useDeleteIndustry,
} from "@/hooks/use-industries";
import type { Industry } from "@/types/leads";
import {
  X,
  Settings,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Check,
  AlertTriangle,
  ShoppingBag,
  Shirt,
  Sparkles,
  Utensils,
  Laptop,
  Heart,
  Palette,
  Camera,
  Music,
  Book,
  Home,
  Car,
  Plane,
  Flower,
  Coffee,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Icon Selector Config ───────────────────────────────────────────────

const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Shirt", icon: Shirt },
  { name: "Sparkles", icon: Sparkles },
  { name: "Utensils", icon: Utensils },
  { name: "Laptop", icon: Laptop },
  { name: "Heart", icon: Heart },
  { name: "Palette", icon: Palette },
  { name: "Camera", icon: Camera },
  { name: "Music", icon: Music },
  { name: "Book", icon: Book },
  { name: "Home", icon: Home },
  { name: "Car", icon: Car },
  { name: "Plane", icon: Plane },
  { name: "Flower", icon: Flower },
  { name: "Coffee", icon: Coffee },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.name, o.icon])
);

// ── Color Picker Config ────────────────────────────────────────────────

const COLOR_OPTIONS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16",
  "#22C55E", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E",
];

// ── Props ──────────────────────────────────────────────────────────────

interface LeadIndustryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── New Industry Form ──────────────────────────────────────────────────

interface NewIndustryFormData {
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  avg_order_value_iqd: number;
}

const INITIAL_FORM: NewIndustryFormData = {
  name: "",
  name_ar: "",
  icon: "ShoppingBag",
  color: "#3B82F6",
  avg_order_value_iqd: 25000,
};

// ── Component ──────────────────────────────────────────────────────────

export function LeadIndustryManager({ isOpen, onClose }: LeadIndustryManagerProps) {
  const { data: industries = [] } = useIndustries();
  const createIndustry = useCreateIndustry();
  const updateIndustry = useUpdateIndustry();
  const deleteIndustry = useDeleteIndustry();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<NewIndustryFormData>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<NewIndustryFormData>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{
    industry: Industry;
    linkedLeads: number;
  } | null>(null);

  // Sort industries by sort_order
  const sorted = [...industries].sort((a, b) => a.sort_order - b.sort_order);

  // ── Handlers ───────────────────────────────────────

  const handleAdd = useCallback(() => {
    if (!formData.name.trim()) return;
    createIndustry.mutate(
      {
        name: formData.name.trim(),
        name_ar: formData.name_ar.trim() || undefined,
        icon: formData.icon,
        color: formData.color,
        avg_order_value_iqd: formData.avg_order_value_iqd,
      },
      {
        onSuccess: () => {
          setFormData(INITIAL_FORM);
          setShowAddForm(false);
        },
      }
    );
  }, [formData, createIndustry]);

  const handleToggleActive = useCallback(
    (industry: Industry) => {
      updateIndustry.mutate({
        id: industry.id,
        data: { is_active: !industry.is_active },
      });
    },
    [updateIndustry]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const current = sorted[index];
      const above = sorted[index - 1];
      updateIndustry.mutate({ id: current.id, data: { sort_order: above.sort_order } });
      updateIndustry.mutate({ id: above.id, data: { sort_order: current.sort_order } });
    },
    [sorted, updateIndustry]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= sorted.length - 1) return;
      const current = sorted[index];
      const below = sorted[index + 1];
      updateIndustry.mutate({ id: current.id, data: { sort_order: below.sort_order } });
      updateIndustry.mutate({ id: below.id, data: { sort_order: current.sort_order } });
    },
    [sorted, updateIndustry]
  );

  const handleStartEdit = (industry: Industry) => {
    setEditingId(industry.id);
    setEditData({
      name: industry.name,
      name_ar: industry.name_ar || "",
      icon: industry.icon,
      color: industry.color,
      avg_order_value_iqd: industry.avg_order_value_iqd,
    });
  };

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    updateIndustry.mutate(
      {
        id: editingId,
        data: {
          name: editData.name?.trim(),
          name_ar: editData.name_ar?.trim() || null,
          icon: editData.icon,
          color: editData.color,
          avg_order_value_iqd: editData.avg_order_value_iqd,
        },
      },
      { onSuccess: () => setEditingId(null) }
    );
  }, [editingId, editData, updateIndustry]);

  const handleDeleteClick = (industry: Industry) => {
    // In a real app we'd check the server for linked leads.
    // For now, simulate: if industry has an id it may be referenced.
    setDeleteConfirm({ industry, linkedLeads: 0 });
  };

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    deleteIndustry.mutate(deleteConfirm.industry.id, {
      onSuccess: () => setDeleteConfirm(null),
    });
  }, [deleteConfirm, deleteIndustry]);

  // Resolve an icon name to a component
  const resolveIcon = (name: string): LucideIcon => {
    return ICON_MAP[name] || ShoppingBag;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm lead-overlay-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[201] flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl lead-modal-in"
        >
          {/* ── Header (fixed) ─────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[var(--muted)]" />
              <Dialog.Title className="text-sm font-semibold text-[var(--foreground)]">
                Manage Industries
              </Dialog.Title>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {/* ── Scrollable body ────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* ── Add Form Toggle ────────────────────────── */}
              <div className="px-6 pt-4">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                    showAddForm
                      ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
                      : "border-2 border-dashed border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  {showAddForm ? "Hide Form" : "Add Industry"}
                </button>
              </div>

              {/* ── Add Industry Form ──────────────────────── */}
              <AnimatePresence>
                {showAddForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE_CHROME }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-4 space-y-4">
                      {/* Name inputs */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
                            Name (English)
                          </label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData((p) => ({ ...p, name: e.target.value }))
                            }
                            placeholder="e.g. Fashion"
                            className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
                            Name (Arabic)
                          </label>
                          <input
                            type="text"
                            dir="rtl"
                            value={formData.name_ar}
                            onChange={(e) =>
                              setFormData((p) => ({ ...p, name_ar: e.target.value }))
                            }
                            placeholder="e.g. ازياء"
                            className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                          />
                        </div>
                      </div>

                      {/* Icon selector */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-1.5">
                          Icon
                        </label>
                        <div className="grid grid-cols-8 gap-1.5">
                          {ICON_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            return (
                              <button
                                key={opt.name}
                                onClick={() =>
                                  setFormData((p) => ({ ...p, icon: opt.name }))
                                }
                                className={cn(
                                  "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                                  formData.icon === opt.name
                                    ? "bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm"
                                    : "bg-black/[0.03] dark:bg-white/[0.03] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
                                )}
                                title={opt.name}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Color picker */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-1.5">
                          Color
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {COLOR_OPTIONS.map((color) => (
                            <button
                              key={color}
                              onClick={() =>
                                setFormData((p) => ({ ...p, color }))
                              }
                              className={cn(
                                "w-7 h-7 rounded-lg transition-all",
                                formData.color === color
                                  ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card-bg)] scale-110"
                                  : "hover:scale-110"
                              )}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Average Order Value */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
                          Average Order Value (IQD)
                        </label>
                        <input
                          type="number"
                          value={formData.avg_order_value_iqd}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              avg_order_value_iqd: Number(e.target.value) || 0,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                        />
                      </div>

                      {/* Submit */}
                      <button
                        onClick={handleAdd}
                        disabled={!formData.name.trim() || createIndustry.isPending}
                        className={cn(
                          "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                          formData.name.trim()
                            ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
                            : "bg-black/[0.05] dark:bg-white/[0.05] text-[var(--muted)] cursor-not-allowed"
                        )}
                      >
                        {createIndustry.isPending ? "Adding..." : "Add Industry"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Industry List ───────────────────────────── */}
              <div className="px-6 py-4">
                {sorted.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-[var(--muted)]">
                      No industries yet. Add one above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sorted.map((industry, index) => {
                      const Icon = resolveIcon(industry.icon);
                      const isEditing = editingId === industry.id;

                      return (
                        <div
                          key={industry.id}
                          className={cn(
                            "rounded-xl border transition-all",
                            isEditing
                              ? "border-[var(--primary)]/30 bg-[var(--primary)]/[0.02]"
                              : "border-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                            !industry.is_active && "opacity-50"
                          )}
                        >
                          {/* ── Display Row ──────────────── */}
                          {!isEditing && (
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              {/* Icon */}
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: `${industry.color}15`,
                                  color: industry.color,
                                }}
                              >
                                <Icon className="w-4 h-4" />
                              </div>

                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                                    {industry.name}
                                  </span>
                                  {industry.name_ar && (
                                    <span className="text-xs text-[var(--muted)] truncate" dir="rtl">
                                      {industry.name_ar}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--muted)]">
                                  Avg. {industry.avg_order_value_iqd.toLocaleString()} IQD
                                </div>
                              </div>

                              {/* Color swatch */}
                              <div
                                className="w-4 h-4 rounded-full shrink-0 border border-black/10 dark:border-white/10"
                                style={{ backgroundColor: industry.color }}
                                title={industry.color}
                              />

                              {/* Active toggle */}
                              <button
                                onClick={() => handleToggleActive(industry)}
                                className={cn(
                                  "relative w-9 h-5 rounded-full transition-colors shrink-0",
                                  industry.is_active
                                    ? "bg-emerald-500"
                                    : "bg-zinc-300 dark:bg-zinc-600"
                                )}
                                title={industry.is_active ? "Active" : "Inactive"}
                              >
                                <div
                                  className={cn(
                                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                                    industry.is_active ? "left-[18px]" : "left-0.5"
                                  )}
                                />
                              </button>

                              {/* Reorder */}
                              <div className="flex flex-col shrink-0">
                                <button
                                  onClick={() => handleMoveUp(index)}
                                  disabled={index === 0}
                                  className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveDown(index)}
                                  disabled={index === sorted.length - 1}
                                  className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Edit */}
                              <button
                                onClick={() => handleStartEdit(industry)}
                                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteClick(industry)}
                                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* ── Edit Row ─────────────────── */}
                          {isEditing && (
                            <div className="px-3 py-3 space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editData.name || ""}
                                  onChange={(e) =>
                                    setEditData((p) => ({ ...p, name: e.target.value }))
                                  }
                                  placeholder="Name (English)"
                                  className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-all"
                                />
                                <input
                                  type="text"
                                  dir="rtl"
                                  value={editData.name_ar || ""}
                                  onChange={(e) =>
                                    setEditData((p) => ({ ...p, name_ar: e.target.value }))
                                  }
                                  placeholder="Name (Arabic)"
                                  className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-all"
                                />
                              </div>

                              {/* Icon grid */}
                              <div className="flex flex-wrap gap-1">
                                {ICON_OPTIONS.map((opt) => {
                                  const OptIcon = opt.icon;
                                  return (
                                    <button
                                      key={opt.name}
                                      onClick={() =>
                                        setEditData((p) => ({ ...p, icon: opt.name }))
                                      }
                                      className={cn(
                                        "w-7 h-7 rounded-md flex items-center justify-center transition-all",
                                        editData.icon === opt.name
                                          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                                          : "bg-black/[0.03] dark:bg-white/[0.03] text-[var(--muted)] hover:text-[var(--foreground)]"
                                      )}
                                    >
                                      <OptIcon className="w-3.5 h-3.5" />
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Color grid */}
                              <div className="flex flex-wrap gap-1">
                                {COLOR_OPTIONS.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() =>
                                      setEditData((p) => ({ ...p, color }))
                                    }
                                    className={cn(
                                      "w-6 h-6 rounded-md transition-all",
                                      editData.color === color &&
                                        "ring-2 ring-[var(--foreground)] ring-offset-1 ring-offset-[var(--card-bg)]"
                                    )}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>

                              {/* Avg order value */}
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] shrink-0">
                                  Avg Order (IQD)
                                </label>
                                <input
                                  type="number"
                                  value={editData.avg_order_value_iqd || 0}
                                  onChange={(e) =>
                                    setEditData((p) => ({
                                      ...p,
                                      avg_order_value_iqd: Number(e.target.value) || 0,
                                    }))
                                  }
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-all"
                                />
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={updateIndustry.isPending}
                                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-fg)] text-xs font-semibold hover:opacity-90 transition-all"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {updateIndustry.isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* ── Delete Confirmation (nested dialog) ──────── */}
      <Dialog.Root
        open={!!deleteConfirm}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirm(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm lead-overlay-in" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[211] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-2xl lead-modal-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-bold text-[var(--foreground)] mb-1">
                  Delete &ldquo;{deleteConfirm?.industry.name}&rdquo;?
                </Dialog.Title>
                {deleteConfirm && deleteConfirm.linkedLeads > 0 ? (
                  <p className="text-xs text-[var(--muted)]">
                    This industry is linked to{" "}
                    <span className="font-semibold text-red-500">
                      {deleteConfirm.linkedLeads}
                    </span>{" "}
                    lead{deleteConfirm.linkedLeads !== 1 ? "s" : ""}. Removing it
                    will set their industry to uncategorized. Continue?
                  </p>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    This industry will be permanently removed. This action cannot
                    be undone.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteIndustry.isPending}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
              >
                {deleteIndustry.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
}
