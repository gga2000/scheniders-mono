"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, ArrowRight } from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { cn } from "@/lib/utils";

interface ComparisonTenant {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
  wallet_balance: number;
  order_count: number;
  team_size: number;
  created_at: string;
}

interface TenantComparisonProps {
  isOpen: boolean;
  onClose: () => void;
  currentTenant: ComparisonTenant;
}

const METRICS: Array<{
  key: keyof ComparisonTenant;
  label: string;
  format: (v: unknown) => string;
  higherIsBetter?: boolean;
}> = [
  { key: "plan", label: "Plan", format: (v) => String(v) },
  { key: "status", label: "Status", format: (v) => String(v) },
  { key: "order_count", label: "Orders", format: (v) => new Intl.NumberFormat("en-IQ").format(v as number), higherIsBetter: true },
  { key: "wallet_balance", label: "Wallet Balance", format: (v) => `${new Intl.NumberFormat("en-IQ").format(v as number)} IQD`, higherIsBetter: true },
  { key: "team_size", label: "Team Size", format: (v) => String(v), higherIsBetter: true },
  { key: "city", label: "City", format: (v) => (v as string) || "\u2014" },
  { key: "created_at", label: "Created", format: (v) => new Date(v as string).toLocaleDateString() },
];

export function TenantComparison({ isOpen, onClose, currentTenant }: TenantComparisonProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ComparisonTenant[]>([]);
  const [compareTenants, setCompareTenants] = useState<ComparisonTenant[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCompareTenants([]);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/merchants?search=${encodeURIComponent(searchQuery)}&limit=5`);
        const data = await res.json();
        const results = (data.merchants || [])
          .filter((m: { id: string }) => m.id !== currentTenant.id && !compareTenants.some((c) => c.id === m.id))
          .map((m: Record<string, unknown>) => ({
            id: m.id as string,
            business_name: m.business_name as string,
            plan: m.plan as string,
            status: m.status as string,
            city: m.city as string | null,
            wallet_balance: ((m.wallet as Record<string, number> | undefined)?.balance_iqd) ?? 0,
            order_count: ((m.usage as Record<string, number> | undefined)?.orders_count) ?? 0,
            team_size: ((m.usage as Record<string, number> | undefined)?.team_members_count) ?? 0,
            created_at: m.created_at as string,
          }));
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, currentTenant.id, compareTenants]);

  function addTenant(t: ComparisonTenant) {
    if (compareTenants.length < 2) {
      setCompareTenants((prev) => [...prev, t]);
      setSearchQuery("");
      setSearchResults([]);
    }
  }

  function removeTenant(id: string) {
    setCompareTenants((prev) => prev.filter((t) => t.id !== id));
  }

  const allTenants = [currentTenant, ...compareTenants];

  function getWinner(key: keyof ComparisonTenant): string | null {
    const metric = METRICS.find((m) => m.key === key);
    if (!metric?.higherIsBetter || allTenants.length < 2) return null;
    let maxVal = -Infinity;
    let winnerId = "";
    for (const t of allTenants) {
      const val = t[key] as number;
      if (val > maxVal) {
        maxVal = val;
        winnerId = t.id;
      }
    }
    return winnerId;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-3xl max-h-[80vh] overflow-y-auto"
          >
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-foreground">Compare Tenants</h2>
                <button onClick={onClose} className="p-1 rounded-lg text-foreground/40 hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add tenant search */}
              {compareTenants.length < 2 && (
                <div className="px-5 py-3 border-b border-[var(--card-border)]">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search to add a tenant to compare..."
                      className="w-full h-9 px-3 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/30"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl z-10 overflow-hidden">
                        {searchResults.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => addTenant(t)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-foreground/5 transition-colors text-left"
                          >
                            <Plus className="w-3 h-3 text-foreground/40" />
                            <span className="font-medium">{t.business_name}</span>
                            <span className="text-xs text-foreground/40 ml-auto">{t.plan}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comparison table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--card-border)]">
                      <th className="p-3 text-left text-xs font-semibold text-foreground/50 w-32">Metric</th>
                      {allTenants.map((t) => (
                        <th key={t.id} className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-xs font-bold text-foreground truncate max-w-[120px]">
                              {t.business_name}
                            </span>
                            {t.id !== currentTenant.id && (
                              <button
                                onClick={() => removeTenant(t.id)}
                                className="text-foreground/30 hover:text-foreground/60"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((metric) => {
                      const winnerId = getWinner(metric.key);
                      return (
                        <tr key={metric.key} className="border-b border-[var(--card-border)] last:border-0">
                          <td className="p-3 text-xs font-medium text-foreground/50">{metric.label}</td>
                          {allTenants.map((t) => (
                            <td
                              key={t.id}
                              className={cn(
                                "p-3 text-center text-sm",
                                winnerId === t.id ? "font-bold text-green-600" : "text-foreground/70",
                              )}
                            >
                              {metric.format(t[metric.key])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
