"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, User, Sparkles, Ban, Users,
  ChevronDown, RotateCcw, SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerStatus } from "@/types/customer";

type StatusFilter = CustomerStatus | "all" | "blacklisted";

interface CustomerFilterSidebarProps {
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  city: string;
  onCityChange: (c: string) => void;
  lastOrderDays?: number;
  onLastOrderDaysChange: (d?: number) => void;
  minLtv?: number;
  maxLtv?: number;
  onLtvChange: (min?: number, max?: number) => void;
  cities: string[];
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string; icon: React.ElementType; color: string }[] = [
  { value: "all",        label: "الكل",    icon: Users,    color: "text-foreground bg-background" },
  { value: "vip",        label: "VIP",     icon: Star,     color: "text-amber-700 bg-(--pastel-yellow)/40" },
  { value: "regular",    label: "منتظم",   icon: User,     color: "text-blue-700 bg-(--pastel-blue)/40" },
  { value: "new",        label: "جديد",    icon: Sparkles, color: "text-teal-700 bg-(--pastel-mint)/40" },
  { value: "blacklisted",label: "محظور",   icon: Ban,      color: "text-rose-700 bg-(--pastel-pink)/40" },
];

const DATE_PRESETS = [
  { label: "اليوم",     value: 1 },
  { label: "7 أيام",   value: 7 },
  { label: "30 يوم",   value: 30 },
  { label: "90 يوم",   value: 90 },
];

function SectionHeader({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2 text-xs font-bold uppercase tracking-widest text-muted hover:text-foreground transition-colors"
      >
        {title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CustomerFilterSidebar({
  status,
  onStatusChange,
  city,
  onCityChange,
  lastOrderDays,
  onLastOrderDaysChange,
  minLtv,
  maxLtv,
  onLtvChange,
  cities,
  isOpen,
  onClose,
}: CustomerFilterSidebarProps) {
  const hasActiveFilters = status !== "all" || !!city || !!lastOrderDays || !!minLtv;

  function handleReset() {
    onStatusChange("all");
    onCityChange("");
    onLastOrderDaysChange(undefined);
    onLtvChange(undefined, undefined);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-(--card-bg)">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--card-border)">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted" />
          <span className="text-sm font-semibold text-foreground">الفلاتر</span>
          {hasActiveFilters && (
            <span className="h-1.5 w-1.5 rounded-full bg-(--pastel-blue)" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="text-xs text-muted hover:text-rose-600 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-(--pastel-pink)/30"
            >
              <RotateCcw className="h-3 w-3" />
              مسح
            </button>
          )}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-muted hover:text-foreground hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Status */}
        <SectionHeader title="الحالة">
          <div className="space-y-1 pb-2">
            {STATUS_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = status === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onStatusChange(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                    active
                      ? "bg-(--pastel-blue)/40 text-foreground font-medium"
                      : "text-muted hover:bg-background"
                  )}
                >
                  <span className={cn("rounded-lg p-1", opt.color)}>
                    <Icon className="h-3 w-3" />
                  </span>
                  {opt.label}
                  {active && (
                    <span className="mr-auto h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </SectionHeader>

        <div className="border-t border-(--card-border)" />

        {/* Last order date */}
        <SectionHeader title="آخر طلب">
          <div className="grid grid-cols-2 gap-1.5 pb-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => onLastOrderDaysChange(lastOrderDays === p.value ? undefined : p.value)}
                className={cn(
                  "rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                  lastOrderDays === p.value
                    ? "border-blue-400 bg-(--pastel-blue)/40 text-foreground"
                    : "border-(--card-border) text-muted hover:border-(--border-hover) hover:bg-background"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </SectionHeader>

        <div className="border-t border-(--card-border)" />

        {/* City */}
        <SectionHeader title="المدينة">
          <div className="space-y-1 pb-2 max-h-40 overflow-y-auto">
            {["", ...cities].map((c) => (
              <button
                key={c || "__all__"}
                onClick={() => onCityChange(c)}
                className={cn(
                  "flex w-full items-center rounded-xl px-3 py-2 text-sm transition-all duration-150",
                  city === c
                    ? "bg-(--pastel-blue)/40 text-foreground font-medium"
                    : "text-muted hover:bg-background"
                )}
              >
                {c || "جميع المدن"}
              </button>
            ))}
          </div>
        </SectionHeader>

        <div className="border-t border-(--card-border)" />

        {/* LTV Range */}
        <SectionHeader title="قيمة العميل (IQD)">
          <div className="space-y-3 pb-2">
            {[
              { label: "أقل من 100ك", min: undefined, max: 100_000 },
              { label: "100ك - 500ك",  min: 100_000,  max: 500_000 },
              { label: "500ك - 1م",    min: 500_000,  max: 1_000_000 },
              { label: "أكثر من 1م",   min: 1_000_000, max: undefined },
            ].map((range) => {
              const active = minLtv === range.min && maxLtv === range.max;
              return (
                <button
                  key={range.label}
                  onClick={() => onLtvChange(active ? undefined : range.min, active ? undefined : range.max)}
                  className={cn(
                    "flex w-full items-center rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-150",
                    active
                      ? "border-blue-400 bg-(--pastel-blue)/40 text-foreground"
                      : "border-(--card-border) text-muted hover:border-(--border-hover) hover:bg-background"
                  )}
                >
                  {range.label}
                  {active && <span className="mr-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
                </button>
              );
            })}
          </div>
        </SectionHeader>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-full w-60 shrink-0 flex-col border-r border-(--card-border) bg-(--card-bg)">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-72 bg-(--card-bg) shadow-2xl lg:hidden"
            >
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
