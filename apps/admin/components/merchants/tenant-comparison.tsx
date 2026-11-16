"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { cn } from "@/lib/utils";
import { fetchComparisonShops, formatBaghdadDay, type ComparisonShop } from "@/lib/merchant-compare";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TenantComparisonProps {
  isOpen: boolean;
  onClose: () => void;
  /** The shop the page is about. Its numbers are read from the Merchants list, like the shops added to it. */
  currentTenantId: string;
}

const TENANT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

const iqd = (amount: number) => `${new Intl.NumberFormat("en-IQ").format(amount)} IQD`;

/** Each row names its window. A row with `number` marks the highest and the lowest shop. */
const METRICS: Array<{
  label: string;
  text: (shop: ComparisonShop) => string;
  number?: (shop: ComparisonShop) => number;
}> = [
  { label: "Plan", text: (s) => s.plan },
  { label: "Status", text: (s) => s.status },
  { label: "Orders, 30 days", text: (s) => new Intl.NumberFormat("en-IQ").format(s.orders_30d), number: (s) => s.orders_30d },
  { label: "Our fees, 30 days", text: (s) => iqd(s.fees_30d), number: (s) => s.fees_30d },
  { label: "Wallet now", text: (s) => iqd(s.wallet_balance), number: (s) => s.wallet_balance },
  { label: "Team now", text: (s) => String(s.team_members), number: (s) => s.team_members },
  { label: "Health score", text: (s) => String(s.health_score), number: (s) => s.health_score },
  { label: "City", text: (s) => s.city || "\u2014" },
  { label: "Created", text: (s) => formatBaghdadDay(s.created_at) },
];

/**
 * The radar's three axes: the parts of the health score, as the database
 * worked them out. A part that takes points away sits at the centre, at 0.
 */
function computeHealthDimensions(tenant: ComparisonShop) {
  const { status, wallet, orders } = tenant.health_parts;
  return { Status: Math.max(0, status), Wallet: Math.max(0, wallet), Orders: Math.max(0, orders) };
}

function SparklineOverlay({ tenants }: { tenants: ComparisonShop[] }) {
  const tenantsWithSparkline = tenants.filter((t) => t.order_sparkline.length > 1);
  if (tenantsWithSparkline.length === 0) return null;

  const w = 64;
  const h = 28;
  const allValues = tenantsWithSparkline.flatMap((t) => t.order_sparkline);
  const max = Math.max(...allValues, 1);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      {tenantsWithSparkline.map((tenant) => {
        const data = tenant.order_sparkline;
        const points = data
          .map((v, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (v / max) * (h - 2) - 1;
            return `${x},${y}`;
          })
          .join(" ");

        const colorIndex = tenants.indexOf(tenant);
        return (
          <polyline
            key={tenant.id}
            fill="none"
            stroke={TENANT_COLORS[colorIndex] ?? TENANT_COLORS[0]}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

export function TenantComparison({ isOpen, onClose, currentTenantId }: TenantComparisonProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFor, setSearchFor] = useState("");
  const [compareTenants, setCompareTenants] = useState<ComparisonShop[]>([]);

  /** Closing starts the next compare from this shop alone. */
  function close() {
    setCompareTenants([]);
    setSearchQuery("");
    onClose();
  }

  // Search a moment after the typing stops.
  useEffect(() => {
    const timeout = setTimeout(() => setSearchFor(searchQuery.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const current = useQuery({
    queryKey: ["admin", "merchants", "compare", currentTenantId],
    queryFn: async () => {
      const [shop] = await fetchComparisonShops(`ids=${currentTenantId}&limit=1`);
      if (!shop) throw new Error("This shop is not on the Merchants list");
      return shop;
    },
    enabled: isOpen,
  });

  const search = useQuery({
    queryKey: ["admin", "merchants", "compare-search", searchFor],
    queryFn: () => fetchComparisonShops(`search=${encodeURIComponent(searchFor)}&limit=5`),
    enabled: isOpen && searchFor.length > 0,
  });

  const searchResults =
    searchQuery.trim().length > 0 && searchFor === searchQuery.trim()
      ? (search.data ?? []).filter((t) => t.id !== currentTenantId && !compareTenants.some((c) => c.id === t.id))
      : [];

  function addTenant(t: ComparisonShop) {
    if (compareTenants.length < 3) {
      setCompareTenants((prev) => [...prev, t]);
      setSearchQuery("");
    }
  }

  function removeTenant(id: string) {
    setCompareTenants((prev) => prev.filter((t) => t.id !== id));
  }

  const allTenants = current.data ? [current.data, ...compareTenants] : [];

  /** The shop with the highest and the shop with the lowest number of a row; none when they are level. */
  function extremes(number: (shop: ComparisonShop) => number): { best: string | null; worst: string | null } {
    if (allTenants.length < 2) return { best: null, worst: null };
    const sorted = [...allTenants].sort((a, b) => number(b) - number(a));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (!top || !bottom || number(top) === number(bottom)) return { best: null, worst: null };
    return { best: top.id, worst: bottom.id };
  }

  // Radar chart data
  const radarData = ["Status", "Wallet", "Orders"].map((dimension) => {
    const entry: Record<string, string | number> = { dimension };
    allTenants.forEach((tenant) => {
      const dims = computeHealthDimensions(tenant);
      entry[tenant.business_name] = dims[dimension as keyof typeof dims];
    });
    return entry;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-4xl max-h-[80vh] overflow-y-auto"
          >
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-foreground">Compare Tenants</h2>
                <button onClick={close} className="p-1 rounded-lg text-foreground/40 hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add tenant search */}
              {compareTenants.length < 3 && (
                <div className="px-5 py-3 border-b border-[var(--card-border)]">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search to add a tenant to compare..."
                      className="w-full h-9 px-3 rounded-lg border border-[var(--card-border)] bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/30"
                    />
                    {search.isError && searchFor.length > 0 && (
                      <p className="mt-1.5 text-xs text-red-600">Search could not load. Type again to retry.</p>
                    )}
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

              {/* Radar Chart */}
              {allTenants.length >= 2 && (
                <div className="px-5 py-4 border-b border-[var(--card-border)]">
                  <h3 className="text-xs font-semibold text-foreground/50 mb-2">Health Score Breakdown</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--card-border)" />
                      <PolarAngleAxis
                        dataKey="dimension"
                        tick={{ fontSize: 11, fill: "var(--foreground)" }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 15]}
                        tick={{ fontSize: 9, fill: "var(--foreground)" }}
                        tickCount={4}
                      />
                      {allTenants.map((tenant, idx) => (
                        <Radar
                          key={tenant.id}
                          name={tenant.business_name}
                          dataKey={tenant.business_name}
                          stroke={TENANT_COLORS[idx]}
                          fill={TENANT_COLORS[idx]}
                          fillOpacity={0.15}
                        />
                      ))}
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Sparkline Overlay */}
              {allTenants.some((t) => t.order_sparkline.length > 1) && (
                <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-3">
                  <span className="text-xs font-semibold text-foreground/50">Orders per day, 30 days</span>
                  <SparklineOverlay tenants={allTenants} />
                  <div className="flex items-center gap-2 ml-2">
                    {allTenants.map((t, idx) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: TENANT_COLORS[idx] }}
                        />
                        <span className="text-[10px] text-foreground/50">{t.business_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comparison table */}
              {current.isPending && (
                <p className="px-5 py-8 text-center text-sm text-foreground/50">Loading this shop&apos;s numbers…</p>
              )}
              {current.isError && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-red-600">Could not load this shop&apos;s numbers.</p>
                  <button
                    onClick={() => current.refetch()}
                    className="mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all"
                  >
                    Try again
                  </button>
                </div>
              )}
              {current.data && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--card-border)]">
                        <th className="p-3 text-left text-xs font-semibold text-foreground/50 w-36">Metric</th>
                        {allTenants.map((t, idx) => (
                          <th key={t.id} className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className="inline-block w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: TENANT_COLORS[idx] }}
                              />
                              <span className="text-xs font-bold text-foreground truncate max-w-[120px]">
                                {t.business_name}
                              </span>
                              {t.id !== currentTenantId && (
                                <button
                                  onClick={() => removeTenant(t.id)}
                                  className="text-foreground/30 hover:text-foreground/60"
                                  aria-label={`Remove ${t.business_name}`}
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
                        const { best, worst } = metric.number ? extremes(metric.number) : { best: null, worst: null };
                        return (
                          <tr key={metric.label} className="border-b border-[var(--card-border)] last:border-0">
                            <td className="p-3 text-xs font-medium text-foreground/50">{metric.label}</td>
                            {allTenants.map((t) => (
                              <td
                                key={t.id}
                                className={cn(
                                  "p-3 text-center text-sm tabular-nums",
                                  best === t.id
                                    ? "text-green-600 font-bold"
                                    : worst === t.id
                                      ? "text-red-500/60"
                                      : "text-foreground/70",
                                )}
                              >
                                {metric.text(t)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
