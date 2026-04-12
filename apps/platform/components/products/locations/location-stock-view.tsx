"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Warehouse,
  MapPin,
  LayoutGrid,
  Layers,
  Box,
  Package,
  Search,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  BarChart3,
  Loader2,
  Filter,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";

type LocationType = "warehouse" | "zone" | "aisle" | "shelf" | "bin";
type ViewMode = "by-location" | "by-product";
type SortKey = "quantity" | "name" | "value";

interface LocationStockViewProps {
  onTransfer: () => void;
}

interface StorageLocation {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  type: LocationType;
  parent_id: string | null;
  description: string | null;
  capacity: number | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  cost: number | null;
  price: number | null;
  image_url: string | null;
}

interface ProductStorageRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  location_id: string;
  quantity: number;
  tenant_id: string;
  updated_at: string;
  storage_locations: StorageLocation;
  products: Product;
}

const typeIcons: Record<LocationType, React.ElementType> = {
  warehouse: Warehouse,
  zone: MapPin,
  aisle: LayoutGrid,
  shelf: Layers,
  bin: Box,
};

const typeBadgeStyles: Record<LocationType, string> = {
  warehouse: "bg-blue-100 text-blue-700",
  zone: "bg-purple-100 text-purple-700",
  aisle: "bg-amber-100 text-amber-700",
  shelf: "bg-emerald-100 text-emerald-700",
  bin: "bg-gray-100 text-gray-600",
};

export function LocationStockView({ onTransfer }: LocationStockViewProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();

  const [viewMode, setViewMode] = useState<ViewMode>("by-location");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("quantity");

  // Fetch all product storage with joins
  const { data: storageRows = [], isLoading } = useQuery({
    queryKey: ["location-stock", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("product_storage")
        .select("*, storage_locations(*), products(*)")
        .eq("tenant_id", tenantId)
        .gt("quantity", 0);
      if (error) throw error;
      return data as ProductStorageRow[];
    },
    enabled: !!tenantId,
  });

  // Fetch all locations for filter dropdown
  const { data: allLocations = [] } = useQuery({
    queryKey: ["storage-locations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("storage_locations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data as StorageLocation[];
    },
    enabled: !!tenantId,
  });

  // Filter rows
  const filteredRows = useMemo(() => {
    let rows = storageRows;
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.products?.name?.toLowerCase().includes(q) ||
          r.products?.sku?.toLowerCase().includes(q) ||
          r.storage_locations?.code?.toLowerCase().includes(q) ||
          r.storage_locations?.name?.toLowerCase().includes(q)
      );
    }
    if (locationFilter) {
      rows = rows.filter((r) => r.location_id === locationFilter);
    }
    return rows;
  }, [storageRows, search, locationFilter]);

  // By-location grouped data
  const locationGroups = useMemo(() => {
    if (viewMode !== "by-location") return [];

    const map = new Map<
      string,
      {
        location: StorageLocation;
        products: { product: Product; quantity: number; value: number }[];
        totalUnits: number;
        totalValue: number;
      }
    >();

    for (const row of filteredRows) {
      if (!row.storage_locations || !row.products) continue;
      const locId = row.location_id;
      if (!map.has(locId)) {
        map.set(locId, {
          location: row.storage_locations,
          products: [],
          totalUnits: 0,
          totalValue: 0,
        });
      }
      const group = map.get(locId)!;
      const val = row.quantity * (row.products.cost || 0);
      group.products.push({
        product: row.products,
        quantity: row.quantity,
        value: val,
      });
      group.totalUnits += row.quantity;
      group.totalValue += val;
    }

    // Sort products within each location
    for (const group of map.values()) {
      group.products.sort((a, b) => {
        if (sortKey === "quantity") return b.quantity - a.quantity;
        if (sortKey === "value") return b.value - a.value;
        return a.product.name.localeCompare(b.product.name);
      });
    }

    return Array.from(map.values()).sort(
      (a, b) => b.totalUnits - a.totalUnits
    );
  }, [filteredRows, viewMode, sortKey]);

  // By-product grouped data
  const productGroups = useMemo(() => {
    if (viewMode !== "by-product") return [];

    const map = new Map<
      string,
      {
        product: Product;
        locations: {
          location: StorageLocation;
          quantity: number;
          value: number;
          storageId: string;
        }[];
        totalStock: number;
        locationCount: number;
      }
    >();

    for (const row of filteredRows) {
      if (!row.storage_locations || !row.products) continue;
      const pid = row.product_id;
      if (!map.has(pid)) {
        map.set(pid, {
          product: row.products,
          locations: [],
          totalStock: 0,
          locationCount: 0,
        });
      }
      const group = map.get(pid)!;
      const val = row.quantity * (row.products.cost || 0);
      group.locations.push({
        location: row.storage_locations,
        quantity: row.quantity,
        value: val,
        storageId: row.id,
      });
      group.totalStock += row.quantity;
    }

    // Only show products with multi-location storage, plus compute locationCount
    const result: {
      product: Product;
      locations: { location: StorageLocation; quantity: number; value: number; storageId: string }[];
      totalStock: number;
      locationCount: number;
    }[] = [];
    for (const group of map.values()) {
      group.locationCount = group.locations.length;
      group.locations.sort((a, b) => b.quantity - a.quantity);
      result.push(group);
    }

    return result.sort((a, b) => b.totalStock - a.totalStock);
  }, [filteredRows, viewMode]);

  // Summary stats
  const summary = useMemo(() => {
    const locationIds = new Set(filteredRows.map((r) => r.location_id));
    const totalUnits = filteredRows.reduce((s, r) => s + r.quantity, 0);
    const totalValue = filteredRows.reduce(
      (s, r) => s + r.quantity * (r.products?.cost || 0),
      0
    );
    return {
      locationCount: locationIds.size,
      totalUnits,
      totalValue,
    };
  }, [filteredRows]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const capacityPercent = (used: number, capacity: number | null) => {
    if (!capacity || capacity <= 0) return null;
    return Math.min(Math.round((used / capacity) * 100), 100);
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          {t("products.locations.stockOverview") || "Location Stock Overview"}
        </h2>
        <button
          type="button"
          onClick={onTransfer}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--pastel-mint)] text-teal-700 rounded-xl text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
        >
          <ArrowRightLeft className="w-4 h-4" />
          {t("products.locations.transfer") || "Transfer Stock"}
        </button>
      </div>

      {/* View mode toggle + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* View toggle */}
        <div className="flex items-center bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-1">
          <button
            type="button"
            onClick={() => {
              setViewMode("by-location");
              setExpandedIds(new Set());
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              viewMode === "by-location"
                ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            )}
          >
            {t("products.locations.byLocation") || "By Location"}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("by-product");
              setExpandedIds(new Set());
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              viewMode === "by-product"
                ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            )}
          >
            {t("products.locations.byProduct") || "By Product"}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              t("products.locations.searchPlaceholder") ||
              "Search product, SKU, or location..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
          />
        </div>

        {/* Location filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm appearance-none min-w-[160px]"
          >
            <option value="">
              {t("products.locations.allLocations") || "All Locations"}
            </option>
            {allLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code} - {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sort (by-location mode) */}
        {viewMode === "by-location" && (
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="pl-10 pr-8 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm appearance-none min-w-[140px]"
            >
              <option value="quantity">
                {t("products.locations.sortQty") || "Sort: Quantity"}
              </option>
              <option value="name">
                {t("products.locations.sortName") || "Sort: Name"}
              </option>
              <option value="value">
                {t("products.locations.sortValue") || "Sort: Value"}
              </option>
            </select>
          </div>
        )}
      </div>

      {/* Summary row */}
      {filteredRows.length > 0 && (
        <div className="flex flex-wrap gap-4 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">
              {t("products.locations.locations") || "Locations"}:
            </span>
            <span className="font-semibold text-foreground">
              {summary.locationCount}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">
              {t("products.locations.totalUnits") || "Total Units"}:
            </span>
            <span className="font-semibold text-foreground">
              {summary.totalUnits.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">
              {t("products.locations.totalValue") || "Total Value"}:
            </span>
            <span className="font-semibold text-foreground">
              {formatIQD(summary.totalValue)}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-10 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
          <MapPin className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">
            {search || locationFilter
              ? t("products.locations.noResults") ||
                "No matching stock found. Try adjusting your filters."
              : t("products.locations.emptyState") ||
                "No location assignments found. Assign products to locations in the product editor."}
          </p>
        </div>
      ) : viewMode === "by-location" ? (
        /* ---- BY LOCATION VIEW ---- */
        <div className="space-y-2">
          {locationGroups.map((group) => {
            const loc = group.location;
            const Icon = typeIcons[loc.type] || Box;
            const isExpanded = expandedIds.has(loc.id);
            const capPercent = capacityPercent(group.totalUnits, loc.capacity);

            return (
              <div
                key={loc.id}
                className="bg-[var(--background)] border border-[var(--card-border)] rounded-xl overflow-hidden"
              >
                {/* Location header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(loc.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--card-border)]/30 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-muted" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {loc.code}
                      </span>
                      <span className="text-sm text-muted">{loc.name}</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase",
                          typeBadgeStyles[loc.type] || "bg-gray-100 text-gray-600"
                        )}
                      >
                        {loc.type}
                      </span>
                    </div>

                    {/* Capacity bar */}
                    {capPercent !== null && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              capPercent > 90
                                ? "bg-rose-500"
                                : capPercent > 70
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            )}
                            style={{ width: `${capPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted">
                          {capPercent}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {group.totalUnits.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted">
                          {t("products.locations.units") || "units"}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {formatIQD(group.totalValue)}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                  </div>
                </button>

                {/* Expanded product table */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--card-border)]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted uppercase tracking-wider">
                              <th className="px-4 py-2 text-left font-medium">
                                {t("products.locations.product") || "Product"}
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                {t("products.locations.sku") || "SKU"}
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                {t("products.locations.qty") || "Qty"}
                              </th>
                              <th className="px-4 py-2 text-right font-medium">
                                {t("products.locations.value") || "Value"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.products.map((item) => (
                              <tr
                                key={item.product.id}
                                className="border-t border-[var(--card-border)]/50 hover:bg-[var(--card-bg)]/50 transition-colors"
                              >
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    {item.product.image_url ? (
                                      <img
                                        src={item.product.image_url}
                                        alt=""
                                        className="w-6 h-6 rounded object-cover"
                                      />
                                    ) : (
                                      <div className="w-6 h-6 rounded bg-[var(--card-border)] flex items-center justify-center">
                                        <Package className="w-3 h-3 text-muted" />
                                      </div>
                                    )}
                                    <span className="text-foreground truncate max-w-[180px]">
                                      {item.product.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs font-mono text-muted">
                                    {item.product.sku}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-foreground">
                                  {item.quantity.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 text-right text-muted">
                                  {formatIQD(item.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        /* ---- BY PRODUCT VIEW ---- */
        <div className="space-y-2">
          {productGroups.map((group) => {
            const isExpanded = expandedIds.has(group.product.id);

            return (
              <div
                key={group.product.id}
                className="bg-[var(--background)] border border-[var(--card-border)] rounded-xl overflow-hidden"
              >
                {/* Product header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.product.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--card-border)]/30 transition-colors text-left"
                >
                  {group.product.image_url ? (
                    <img
                      src={group.product.image_url}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-muted" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {group.product.name}
                    </p>
                    <p className="text-xs text-muted font-mono">
                      {group.product.sku}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {group.totalStock.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted">
                          {t("products.locations.total") || "total"}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {group.locationCount}{" "}
                        {group.locationCount === 1
                          ? t("products.locations.location") || "location"
                          : t("products.locations.locations") || "locations"}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                  </div>
                </button>

                {/* Expanded location breakdown */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--card-border)]">
                        {group.locations.map((locItem) => {
                          const Icon =
                            typeIcons[locItem.location.type] || Box;
                          return (
                            <div
                              key={locItem.storageId}
                              className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]/50 last:border-b-0 hover:bg-[var(--card-bg)]/50 transition-colors"
                            >
                              <div className="w-7 h-7 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5 text-muted" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {locItem.location.code}
                                  </span>
                                  <span className="text-xs text-muted">
                                    {locItem.location.name}
                                  </span>
                                </div>
                              </div>
                              <span className="text-sm font-medium text-foreground shrink-0">
                                {locItem.quantity.toLocaleString()}{" "}
                                <span className="text-xs font-normal text-muted">
                                  {t("products.locations.units") || "units"}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTransfer();
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pastel-yellow)]/30 text-amber-700 rounded-lg text-xs font-medium hover:bg-[var(--pastel-yellow)]/50 transition-colors shrink-0"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                {t("products.locations.transfer") || "Transfer"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
