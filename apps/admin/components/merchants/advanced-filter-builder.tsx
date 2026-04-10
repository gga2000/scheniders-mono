"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Filter, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_CHROME } from "@/lib/animation-constants";
import type { FilterCondition, FilterGroup, AdvancedFilters } from "@/types/admin";

// ── Field definitions ──────────────────────────────────────────────────
const FIELDS = [
  { id: "status", label: "Status", type: "enum", options: ["trial", "active", "suspended", "cancelled"] },
  { id: "plan", label: "Plan", type: "enum", options: ["starter", "growth", "professional", "enterprise"] },
  { id: "city", label: "City", type: "string" },
  { id: "balance", label: "Balance (IQD)", type: "number" },
  { id: "orders", label: "Orders", type: "number" },
  { id: "health", label: "Health Score", type: "number" },
  { id: "revenue", label: "Revenue/mo", type: "number" },
  { id: "last_active_at", label: "Last Active", type: "date" },
  { id: "created_at", label: "Created Date", type: "date" },
  { id: "tags", label: "Tags", type: "array" },
] as const;

const OPERATORS: Record<string, Array<{ id: string; label: string }>> = {
  enum: [
    { id: "equals", label: "is" },
    { id: "not_equals", label: "is not" },
    { id: "in", label: "is any of" },
  ],
  string: [
    { id: "equals", label: "equals" },
    { id: "not_equals", label: "not equals" },
    { id: "contains", label: "contains" },
  ],
  number: [
    { id: "equals", label: "=" },
    { id: "gt", label: ">" },
    { id: "gte", label: ">=" },
    { id: "lt", label: "<" },
    { id: "lte", label: "<=" },
    { id: "between", label: "between" },
  ],
  date: [
    { id: "before", label: "before" },
    { id: "after", label: "after" },
    { id: "between", label: "between" },
    { id: "within_last", label: "within last (days)" },
  ],
  array: [
    { id: "contains", label: "contains" },
    { id: "not_contains", label: "does not contain" },
  ],
};

// ── Props ──────────────────────────────────────────────────────────────
interface AdvancedFilterBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: AdvancedFilters) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────
function createCondition(): FilterCondition {
  return { field: "status", operator: "equals", value: "" };
}

function createGroup(): FilterGroup {
  return { logic: "and", conditions: [createCondition()] };
}

export function AdvancedFilterBuilder({ isOpen, onClose, onApply }: AdvancedFilterBuilderProps) {
  const [filters, setFilters] = useState<AdvancedFilters>({
    logic: "and",
    groups: [createGroup()],
  });

  const updateGroupLogic = useCallback((groupIdx: number, logic: "and" | "or") => {
    setFilters((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) => (i === groupIdx ? { ...g, logic } : g)),
    }));
  }, []);

  const updateCondition = useCallback(
    (groupIdx: number, condIdx: number, updates: Partial<FilterCondition>) => {
      setFilters((prev) => ({
        ...prev,
        groups: prev.groups.map((g, gi) =>
          gi === groupIdx
            ? {
                ...g,
                conditions: g.conditions.map((c, ci) =>
                  ci === condIdx ? { ...c, ...updates } : c
                ),
              }
            : g
        ),
      }));
    },
    []
  );

  const addCondition = useCallback((groupIdx: number) => {
    setFilters((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIdx ? { ...g, conditions: [...g.conditions, createCondition()] } : g
      ),
    }));
  }, []);

  const removeCondition = useCallback((groupIdx: number, condIdx: number) => {
    setFilters((prev) => ({
      ...prev,
      groups: prev.groups.map((g, gi) =>
        gi === groupIdx
          ? { ...g, conditions: g.conditions.filter((_, ci) => ci !== condIdx) }
          : g
      ).filter((g) => g.conditions.length > 0),
    }));
  }, []);

  const addGroup = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      groups: [...prev.groups, createGroup()],
    }));
  }, []);

  const removeGroup = useCallback((groupIdx: number) => {
    setFilters((prev) => ({
      ...prev,
      groups: prev.groups.filter((_, i) => i !== groupIdx),
    }));
  }, []);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleClear = () => {
    setFilters({ logic: "and", groups: [createGroup()] });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[200]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: EASE_CHROME as unknown as number[] }}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl z-[201] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-foreground/50" />
                <h2 className="text-sm font-bold text-foreground">Advanced Filters</h2>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-foreground/5 transition-colors">
                <X className="w-4 h-4 text-foreground/50" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              {/* Top-level logic */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground/50">Match</span>
                <LogicToggle value={filters.logic} onChange={(l) => setFilters((f) => ({ ...f, logic: l }))} />
                <span className="text-foreground/50">of the following groups</span>
              </div>

              {/* Groups */}
              {filters.groups.map((group, groupIdx) => (
                <div
                  key={groupIdx}
                  className="border border-[var(--card-border)] rounded-xl p-4 space-y-3"
                >
                  {/* Group header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-foreground/50">Where</span>
                      <LogicToggle
                        value={group.logic}
                        onChange={(l) => updateGroupLogic(groupIdx, l)}
                      />
                      <span className="text-foreground/50">conditions match</span>
                    </div>
                    {filters.groups.length > 1 && (
                      <button
                        onClick={() => removeGroup(groupIdx)}
                        className="p-1 text-foreground/30 hover:text-red-500 transition-colors"
                        aria-label="Remove group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Conditions */}
                  {group.conditions.map((condition, condIdx) => (
                    <ConditionRow
                      key={condIdx}
                      condition={condition}
                      onChange={(updates) => updateCondition(groupIdx, condIdx, updates)}
                      onRemove={() => removeCondition(groupIdx, condIdx)}
                      canRemove={group.conditions.length > 1}
                    />
                  ))}

                  {/* Add condition */}
                  <button
                    onClick={() => addCondition(groupIdx)}
                    className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add condition
                  </button>
                </div>
              ))}

              {/* Add group */}
              <button
                onClick={addGroup}
                className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors flex items-center gap-1 px-1"
              >
                <Plus className="w-3 h-3" />
                Add group
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--card-border)]">
              <button
                onClick={handleClear}
                className="text-xs text-foreground/50 hover:text-foreground transition-colors"
              >
                Clear all
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--card-border)] hover:border-foreground/30 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-all"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function LogicToggle({ value, onChange }: { value: "and" | "or"; onChange: (v: "and" | "or") => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-foreground/[0.05] rounded-lg p-0.5">
      {(["and", "or"] as const).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-bold uppercase rounded-md transition-all",
            value === opt
              ? "bg-[var(--card-bg)] text-foreground shadow-sm"
              : "text-foreground/40 hover:text-foreground/60"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: FilterCondition;
  onChange: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const field = FIELDS.find((f) => f.id === condition.field);
  const fieldType = field?.type ?? "string";
  const operators = OPERATORS[fieldType] ?? OPERATORS.string;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Field select */}
      <select
        value={condition.field}
        onChange={(e) => onChange({ field: e.target.value, value: "", operator: "equals" })}
        className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground min-w-[120px]"
      >
        {FIELDS.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>

      {/* Operator select */}
      <select
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterCondition["operator"] })}
        className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground"
      >
        {operators.map((op) => (
          <option key={op.id} value={op.id}>{op.label}</option>
        ))}
      </select>

      {/* Value input */}
      {field?.type === "enum" && "options" in field ? (
        <select
          value={String(condition.value)}
          onChange={(e) => onChange({ value: e.target.value })}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground min-w-[120px]"
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : condition.operator === "between" ? (
        <div className="flex items-center gap-1">
          <input
            type={fieldType === "date" ? "date" : "number"}
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ value: e.target.value })}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground w-24"
            placeholder="From"
          />
          <span className="text-[10px] text-foreground/40">to</span>
          <input
            type={fieldType === "date" ? "date" : "number"}
            value={String(condition.secondValue ?? "")}
            onChange={(e) => onChange({ secondValue: e.target.value })}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground w-24"
            placeholder="To"
          />
        </div>
      ) : (
        <input
          type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
          value={String(condition.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value })}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground min-w-[120px]"
          placeholder={
            condition.operator === "within_last" ? "Number of days" : "Value..."
          }
        />
      )}

      {/* Remove */}
      {canRemove && (
        <button
          onClick={onRemove}
          className="p-1 text-foreground/20 hover:text-red-500 transition-colors"
          aria-label="Remove condition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
