"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { EASE_CHROME } from "@/lib/animation-constants";
import {
  useIndustries,
  useCreateIndustry,
  useUpdateIndustry,
  useMoveIndustry,
  useDeleteIndustry,
  IndustryGoneError,
} from "@/hooks/use-industries";
import type { Industry } from "@/types/leads";
import { industryChanges, industryForm, type IndustryForm } from "@/lib/industry-edit";
import { LoadError } from "@/components/shared/load-error";
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
import { formatIQD } from "@/lib/format";

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

const INITIAL_FORM: IndustryForm = {
  name: "",
  name_ar: "",
  icon: "ShoppingBag",
  color: "#3B82F6",
  avg_order_value_iqd: 25000,
};

// ── Component ──────────────────────────────────────────────────────────

export function LeadIndustryManager({ isOpen, onClose }: LeadIndustryManagerProps) {
  const { data: industries = [], isLoading, isError, error, refetch, isFetching } = useIndustries();
  const createIndustry = useCreateIndustry();
  const updateIndustry = useUpdateIndustry();
  const moveIndustry = useMoveIndustry();
  const deleteIndustry = useDeleteIndustry();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<IndustryForm>(INITIAL_FORM);
  // The row being edited: what it opened with, and what is typed now.
  const [editing, setEditing] = useState<{ id: string; opened: IndustryForm } | null>(null);
  const [editData, setEditData] = useState<IndustryForm>(INITIAL_FORM);
  const editingId = editing?.id ?? null;
  const [deleteConfirm, setDeleteConfirm] = useState<Industry | null>(null);

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
        onError: (error) => toast.error(error.message),
      }
    );
  }, [formData, createIndustry]);

  const handleToggleActive = useCallback(
    (industry: Industry) => {
      updateIndustry.mutate(
        { id: industry.id, data: { is_active: !industry.is_active } },
        { onError: (error) => toast.error(`Could not turn ${industry.is_active ? "off" : "on"} "${industry.name}": ${error.message}`) },
      );
    },
    [updateIndustry]
  );

  // One write: the server moves the industry past its neighbour and renumbers
  // the list, so two industries never share a place.
  const move = (industry: Industry, direction: "up" | "down") => {
    moveIndustry.mutate(
      { id: industry.id, direction },
      { onError: (error) => toast.error(`Could not move "${industry.name}": ${error.message}`) },
    );
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) move(sorted[index], "up");
  };

  const handleMoveDown = (index: number) => {
    if (index < sorted.length - 1) move(sorted[index], "down");
  };

  const handleStartEdit = (industry: Industry) => {
    const opened = industryForm(industry);
    setEditing({ id: industry.id, opened });
    setEditData(opened);
  };

  // Only the fields changed in the row are sent, so a colleague's change to
  // another field meanwhile stands. A save that changed nothing just closes.
  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    const data = industryChanges(editing.opened, editData);
    if (Object.keys(data).length === 0) {
      setEditing(null);
      return;
    }
    updateIndustry.mutate(
      { id: editing.id, data },
      // A refused save keeps the row open with what was typed, unless a
      // colleague removed the industry: then there is nothing left to edit.
      {
        onSuccess: () => setEditing(null),
        onError: (error) => {
          if (error instanceof IndustryGoneError) setEditing(null);
          toast.error(error.message);
        },
      }
    );
  }, [editing, editData, updateIndustry]);

  const handleDeleteClick = (industry: Industry) => setDeleteConfirm(industry);

  // The server decides: an industry no lead uses is removed; one that leads
  // use is switched off and they keep it. Staff are told which happened.
  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    deleteIndustry.mutate(id, {
      onSuccess: (answer) => {
        setDeleteConfirm(null);
        if (answer.result === "removed") {
          toast.success(`"${name}" removed.`);
        } else {
          const leads = `${answer.leads_using_it} lead${answer.leads_using_it === 1 ? "" : "s"}`;
          toast.success(`"${name}" switched off. ${leads} still use it, so it was not removed.`);
        }
      },
      // A colleague removed it first: the confirm closes and the list shows it gone.
      onError: (error) => {
        if (error instanceof IndustryGoneError) setDeleteConfirm(null);
        toast.error(error.message);
      },
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
                          <label className="block text-xs uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
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
                          <label className="block text-xs uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
                            Name (Arabic)
                          </label>
                          <input
                            type="text"
                            dir="rtl"
                            value={formData.name_ar}
                            onChange={(e) =>
                              setFormData((p) => ({ ...p, name_ar: e.target.value }))
                            }
                            placeholder="مثال: أزياء"
                            className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                          />
                        </div>
                      </div>

                      {/* Icon selector */}
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-medium text-[var(--muted)] mb-1.5">
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
                        <label className="block text-xs uppercase tracking-wider font-medium text-[var(--muted)] mb-1.5">
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
                        <label className="block text-xs uppercase tracking-wider font-medium text-[var(--muted)] mb-1">
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
                {isError ? (
                  <LoadError compact what="the industries" error={error} onRetry={() => refetch()} retrying={isFetching} />
                ) : isLoading ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-[var(--muted)]">Loading industries...</p>
                  </div>
                ) : sorted.length === 0 ? (
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
                                  <span className="text-sm font-semibold text-[var(--foreground)] truncate" title={industry.name}>
                                    {industry.name}
                                  </span>
                                  {industry.name_ar && (
                                    <span className="text-xs text-[var(--muted)] truncate" dir="rtl" title={industry.name_ar}>
                                      {industry.name_ar}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[var(--muted)]">
                                  Avg. {formatIQD(industry.avg_order_value_iqd)}
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
                                  aria-label={`Move ${industry.name} up`}
                                  disabled={index === 0 || moveIndustry.isPending}
                                  className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveDown(index)}
                                  aria-label={`Move ${industry.name} down`}
                                  disabled={index === sorted.length - 1 || moveIndustry.isPending}
                                  className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Edit */}
                              <button
                                onClick={() => handleStartEdit(industry)}
                                aria-label={`Edit ${industry.name}`}
                                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteClick(industry)}
                                aria-label={`Delete ${industry.name}`}
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
                                  value={editData.name}
                                  onChange={(e) =>
                                    setEditData((p) => ({ ...p, name: e.target.value }))
                                  }
                                  placeholder="Name (English)"
                                  className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-all"
                                />
                                <input
                                  type="text"
                                  dir="rtl"
                                  value={editData.name_ar}
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
                                <label className="text-xs uppercase tracking-wider font-medium text-[var(--muted)] shrink-0">
                                  Avg Order (IQD)
                                </label>
                                <input
                                  type="number"
                                  value={editData.avg_order_value_iqd}
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
                                  onClick={() => setEditing(null)}
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
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[var(--ink-red)]" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-bold text-[var(--foreground)] mb-1">
                  Delete &ldquo;{deleteConfirm?.name}&rdquo;?
                </Dialog.Title>
                <p className="text-xs text-[var(--muted)]">
                  If no lead uses it, it is removed for good. If leads use it, it
                  is switched off instead and those leads keep it.
                </p>
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
