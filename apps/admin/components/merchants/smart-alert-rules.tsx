"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Settings,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  ChevronDown,
  CheckCircle,
} from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";

// ── Rule Types ────────────────────────────────────────────────────────

type RuleField = "balance" | "orders" | "last_active_days" | "trial_remaining_days";
type RuleOperator = "lt" | "lte" | "gt" | "gte" | "eq";

interface AlertRule {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: number;
  enabled: boolean;
}

interface TriggeredAlert {
  ruleId: string;
  merchantId: string;
  merchantName: string;
  message: string;
}

const FIELD_OPTIONS: { value: RuleField; label: string; unit: string }[] = [
  { value: "balance", label: "Wallet balance", unit: "IQD" },
  { value: "orders", label: "Order count", unit: "orders" },
  { value: "last_active_days", label: "Days since last active", unit: "days" },
  { value: "trial_remaining_days", label: "Trial days remaining", unit: "days" },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string; symbol: string }[] = [
  { value: "lt", label: "less than", symbol: "<" },
  { value: "lte", label: "at most", symbol: "\u2264" },
  { value: "gt", label: "greater than", symbol: ">" },
  { value: "gte", label: "at least", symbol: "\u2265" },
  { value: "eq", label: "equal to", symbol: "=" },
];

const STORAGE_KEY = "admin-smart-alert-rules";

function loadRules(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: AlertRule[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Quota exceeded or unavailable
  }
}

function getMerchantFieldValue(merchant: AdminTenant, field: RuleField): number | null {
  switch (field) {
    case "balance":
      return merchant.wallet?.balance_iqd ?? 0;
    case "orders":
      return merchant.usage?.orders_count ?? 0;
    case "last_active_days": {
      if (!merchant.last_active_at) return null;
      const diff = Date.now() - new Date(merchant.last_active_at).getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    case "trial_remaining_days": {
      if (merchant.status !== "trial" || !merchant.trial_ends_at) return null;
      const diff = new Date(merchant.trial_ends_at).getTime() - Date.now();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    default:
      return null;
  }
}

function checkCondition(actual: number, operator: RuleOperator, target: number): boolean {
  switch (operator) {
    case "lt": return actual < target;
    case "lte": return actual <= target;
    case "gt": return actual > target;
    case "gte": return actual >= target;
    case "eq": return actual === target;
  }
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// ── Preset templates ──────────────────────────────────────────────────

const PRESET_RULES: Omit<AlertRule, "id">[] = [
  { field: "balance", operator: "lt", value: 5000, enabled: true },
  { field: "orders", operator: "eq", value: 0, enabled: true },
  { field: "trial_remaining_days", operator: "lte", value: 3, enabled: true },
  { field: "last_active_days", operator: "gte", value: 7, enabled: true },
];

// ── Component ─────────────────────────────────────────────────────────

interface SmartAlertRulesProps {
  merchants: AdminTenant[];
}

export function SmartAlertRules({ merchants }: SmartAlertRulesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>(loadRules);

  // Persist rules on change
  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  // Evaluate rules against merchants
  const alerts = useMemo<TriggeredAlert[]>(() => {
    const results: TriggeredAlert[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const fieldInfo = FIELD_OPTIONS.find((f) => f.value === rule.field);
      const opInfo = OPERATOR_OPTIONS.find((o) => o.value === rule.operator);
      if (!fieldInfo || !opInfo) continue;

      for (const m of merchants) {
        const val = getMerchantFieldValue(m, rule.field);
        if (val === null) continue;
        if (checkCondition(val, rule.operator, rule.value)) {
          results.push({
            ruleId: rule.id,
            merchantId: m.id,
            merchantName: m.business_name,
            message: `${fieldInfo.label} is ${val.toLocaleString()} ${fieldInfo.unit} (${opInfo.symbol} ${rule.value.toLocaleString()})`,
          });
        }
      }
    }
    return results;
  }, [rules, merchants]);

  const addRule = useCallback(() => {
    setRules((prev) => [
      ...prev,
      { id: makeId(), field: "balance", operator: "lt", value: 5000, enabled: true },
    ]);
  }, []);

  const removeRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRule = useCallback((id: string, updates: Partial<AlertRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  }, []);

  const addPresets = useCallback(() => {
    setRules((prev) => {
      const newRules = PRESET_RULES.map((p) => ({ ...p, id: makeId() }));
      return [...prev, ...newRules];
    });
  }, []);

  const alertCount = alerts.length;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground/40 hover:text-foreground/70 transition-all"
        title="Smart alert rules"
        aria-label="Smart alert rules"
      >
        <Bell className="w-3.5 h-3.5" />
        {alertCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </button>

      {/* Settings panel (modal) */}
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: EASE_CHROME }}
              className="bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--card-border)] w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-foreground/50" />
                  <h2 className="text-sm font-bold text-foreground">Smart Alert Rules</h2>
                  {alertCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-400">
                      {alertCount} triggered
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {rules.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 text-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-foreground/40 mb-3">No alert rules configured</p>
                    <button
                      onClick={addPresets}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-all"
                    >
                      Add Default Rules
                    </button>
                  </div>
                ) : (
                  rules.map((rule) => {
                    const matchCount = alerts.filter((a) => a.ruleId === rule.id).length;
                    return (
                      <div
                        key={rule.id}
                        className={cn(
                          "p-3 rounded-xl border transition-all",
                          rule.enabled
                            ? "border-[var(--card-border)] bg-[var(--card-bg)]"
                            : "border-[var(--card-border)] bg-foreground/[0.02] opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                              className="w-3.5 h-3.5 rounded border-[var(--card-border)] accent-[#1E1E1E]"
                            />
                            <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider">
                              {rule.enabled ? "Active" : "Paused"}
                            </span>
                          </label>
                          {matchCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-400">
                              {matchCount} match{matchCount !== 1 ? "es" : ""}
                            </span>
                          )}
                          <button
                            onClick={() => removeRule(rule.id)}
                            className="p-1 rounded text-foreground/30 hover:text-red-500 transition-colors"
                            aria-label="Remove rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-foreground/50">When</span>
                          <select
                            value={rule.field}
                            onChange={(e) => updateRule(rule.id, { field: e.target.value as RuleField })}
                            className="px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/10"
                          >
                            {FIELD_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                          <span className="text-xs text-foreground/50">is</span>
                          <select
                            value={rule.operator}
                            onChange={(e) => updateRule(rule.id, { operator: e.target.value as RuleOperator })}
                            className="px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/10"
                          >
                            {OPERATOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={rule.value}
                            onChange={(e) => updateRule(rule.id, { value: Number(e.target.value) })}
                            className="w-20 px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-foreground/10"
                          />
                          <span className="text-[10px] text-foreground/40">
                            {FIELD_OPTIONS.find((f) => f.value === rule.field)?.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Triggered alerts preview */}
                {alerts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                    <h3 className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider mb-2">
                      Triggered Alerts ({alerts.length})
                    </h3>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {alerts.slice(0, 20).map((alert, idx) => (
                        <div
                          key={`${alert.ruleId}-${alert.merchantId}-${idx}`}
                          className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-red-50/50 dark:bg-red-400/5"
                        >
                          <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-foreground truncate">
                              {alert.merchantName}
                            </p>
                            <p className="text-[10px] text-foreground/50 truncate">
                              {alert.message}
                            </p>
                          </div>
                        </div>
                      ))}
                      {alerts.length > 20 && (
                        <p className="text-[10px] text-foreground/40 text-center">
                          +{alerts.length - 20} more alerts
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[var(--card-border)] flex items-center justify-between">
                <button
                  onClick={addRule}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground/60 hover:text-foreground border border-dashed border-[var(--card-border)] hover:border-foreground/30 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Rule
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
