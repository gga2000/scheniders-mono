"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, slugify } from "@/lib/utils";
import type { Lead, Industry } from "@/types/leads";
import { useBuildStore } from "@/hooks/use-lead-mutations";
import { useIndustries } from "@/hooks/use-industries";
import {
  Store,
  X,
  Shirt,
  Sparkles,
  Cpu,
  UtensilsCrossed,
  Package,
  Plus,
  Trash2,
  Loader2,
  ChevronRight,
  Settings2,
  Zap,
} from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";

// ── Types ──────────────────────────────────────────────────────────────

interface LeadBuildStoreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

interface ProductRow {
  name: string;
  price: string;
  image_url: string;
}

type Template = "fashion" | "beauty" | "electronics" | "food" | "general";

const TEMPLATES: { key: Template; label: string; icon: typeof Shirt }[] = [
  { key: "fashion", label: "Fashion", icon: Shirt },
  { key: "beauty", label: "Beauty", icon: Sparkles },
  { key: "electronics", label: "Electronics", icon: Cpu },
  { key: "food", label: "Food", icon: UtensilsCrossed },
  { key: "general", label: "General", icon: Package },
];

const PRESET_COLORS = [
  "#1E1E1E", "#EF4444", "#F97316", "#F59E0B", "#22C55E",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  "#14B8A6", "#84CC16",
];

const emptyProduct = (): ProductRow => ({ name: "", price: "", image_url: "" });

// ── Component ──────────────────────────────────────────────────────────

export function LeadBuildStoreDialog({ isOpen, onClose, lead }: LeadBuildStoreDialogProps) {
  const buildStore = useBuildStore();
  const { data: industries } = useIndustries();

  // Mode
  const [mode, setMode] = useState<"quick" | "advanced">("quick");

  // Form fields (shared)
  const [businessName, setBusinessName] = useState(lead.merchant_name);
  const [industryId, setIndustryId] = useState(lead.industry_id ?? "");
  const [template, setTemplate] = useState<Template>("general");

  // Advanced-only fields
  const [customSlug, setCustomSlug] = useState("");
  const [description, setDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1E1E1E");
  const [products, setProducts] = useState<ProductRow[]>([emptyProduct()]);

  // Derived slug
  const slug = useMemo(() => {
    if (mode === "advanced" && customSlug.trim()) {
      return slugify(customSlug);
    }
    return slugify(businessName);
  }, [mode, customSlug, businessName]);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setMode("quick");
      setBusinessName(lead.merchant_name);
      setIndustryId(lead.industry_id ?? "");
      setTemplate("general");
      setCustomSlug("");
      setDescription("");
      setPrimaryColor("#1E1E1E");
      setProducts([emptyProduct()]);
      buildStore.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lead]);

  // Product row helpers
  const addProduct = () => {
    if (products.length < 10) {
      setProducts((prev) => [...prev, emptyProduct()]);
    }
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: keyof ProductRow, value: string) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  // Submit
  const handleSubmit = () => {
    const data: Record<string, unknown> = {
      business_name: businessName,
      industry_id: industryId || null,
      template,
      slug,
    };

    if (mode === "advanced") {
      data.description = description || null;
      data.primary_color = primaryColor;
      data.products = products
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name,
          price: parseInt(p.price, 10) || 0,
          image_url: p.image_url || null,
        }));
    }

    buildStore.mutate(
      { leadId: lead.id, data },
      { onSuccess: () => onClose() }
    );
  };

  const canSubmit = businessName.trim().length > 0 && !buildStore.isPending;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ──────────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <Store className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <h2 className="text-lg font-bold text-[var(--foreground)]">
                    Build Prospect Store
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Body ────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Mode Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--foreground)]/5 w-fit">
                  <button
                    onClick={() => setMode("quick")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      mode === "quick"
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Quick Create
                  </button>
                  <button
                    onClick={() => setMode("advanced")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      mode === "advanced"
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    )}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Advanced
                  </button>
                </div>

                {/* Business Name */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                    placeholder="e.g. Zara Baghdad"
                  />
                </div>

                {/* Industry Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    Industry
                  </label>
                  <select
                    value={industryId}
                    onChange={(e) => setIndustryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                  >
                    <option value="">Select industry...</option>
                    {industries?.map((ind: Industry) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Picker */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                    Template
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {TEMPLATES.map((t) => {
                      const Icon = t.icon;
                      const isSelected = template === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTemplate(t.key)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
                            isSelected
                              ? "border-[var(--primary)] bg-[var(--primary)]/5"
                              : "border-[var(--card-border)] hover:border-[var(--foreground)]/20 bg-[var(--foreground)]/[0.02]"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-5 h-5 transition-colors",
                              isSelected ? "text-[var(--primary)]" : "text-[var(--muted)]"
                            )}
                          />
                          <span
                            className={cn(
                              "text-[11px] font-semibold transition-colors",
                              isSelected ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                            )}
                          >
                            {t.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Advanced Fields */}
                <AnimatePresence mode="wait">
                  {mode === "advanced" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: EASE_CHROME }}
                      className="overflow-hidden space-y-5"
                    >
                      {/* Custom Slug */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                          Custom Slug
                        </label>
                        <input
                          type="text"
                          value={customSlug}
                          onChange={(e) => setCustomSlug(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                          placeholder="e.g. zara-baghdad"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                          Description
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow resize-none"
                          placeholder="Brief description of the store..."
                        />
                      </div>

                      {/* Primary Color */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                          Primary Color
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setPrimaryColor(color)}
                              className={cn(
                                "w-8 h-8 rounded-lg transition-all",
                                primaryColor === color
                                  ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card-bg)] scale-110"
                                  : "hover:scale-105"
                              )}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Products */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                            Initial Products
                          </label>
                          <span className="text-[10px] text-[var(--muted)]">
                            {products.length}/10
                          </span>
                        </div>
                        <div className="space-y-2">
                          {products.map((product, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-start gap-2"
                            >
                              <input
                                type="text"
                                value={product.name}
                                onChange={(e) => updateProduct(index, "name", e.target.value)}
                                className="flex-1 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                                placeholder="Product name"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={product.price}
                                onChange={(e) => updateProduct(index, "price", e.target.value.replace(/[^0-9]/g, ""))}
                                className="w-28 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                                placeholder="Price (IQD)"
                              />
                              <input
                                type="text"
                                value={product.image_url}
                                onChange={(e) => updateProduct(index, "image_url", e.target.value)}
                                className="w-36 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                                placeholder="Image URL (optional)"
                              />
                              <button
                                type="button"
                                onClick={() => removeProduct(index)}
                                disabled={products.length <= 1}
                                className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                        {products.length < 10 && (
                          <button
                            type="button"
                            onClick={addProduct}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Product
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Preview Text */}
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--card-border)]">
                  <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
                  <p className="text-xs text-[var(--muted)]">
                    This will create a prospect store at{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      scheniders.com/{slug || "..."}
                    </span>
                  </p>
                </div>

                {/* Error State */}
                {buildStore.isError && (
                  <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-medium">
                    {buildStore.error?.message || "Failed to build store. Please try again."}
                  </div>
                )}
              </div>

              {/* ── Footer ──────────────────────────────────────── */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                    "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {buildStore.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Store className="w-4 h-4" />
                  )}
                  Create Store
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
