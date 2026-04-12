"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Fuse from "fuse.js";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  FolderOpen,
  Columns3,
  Flame,
  AlertTriangle,
  TrendingDown,
  ClipboardCheck,
  Download,
  Upload,
  ShoppingCart,
  Clock,
  Package,
  Tag,
  Command,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";

// =============================================
// TYPES
// =============================================

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (result: {
    type: "product" | "action" | "category";
    id?: string;
    action?: string;
  }) => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
}

interface ProductResult {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  image_url: string | null;
}

interface CategoryResult {
  id: string;
  name: string;
  product_count: number;
}

interface RecentItem {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
}

type ResultItem =
  | { section: "recent"; data: RecentItem }
  | { section: "products"; data: ProductResult }
  | { section: "actions"; data: ActionItem }
  | { section: "categories"; data: CategoryResult };

// =============================================
// CONSTANTS
// =============================================

const RECENT_STORAGE_KEY = "command-palette-recent";
const MAX_RECENT = 5;
const MAX_RESULTS = 5;

const ACTIONS: ActionItem[] = [
  { id: "create-product", label: "Create new product", icon: Plus, action: "create-product" },
  { id: "view-grid", label: "Switch to Grid view", icon: LayoutGrid, action: "view-grid" },
  { id: "view-list", label: "Switch to List view", icon: List, action: "view-list" },
  { id: "view-category", label: "Switch to Category view", icon: FolderOpen, action: "view-category" },
  { id: "view-kanban", label: "Switch to Kanban view", icon: Columns3, action: "view-kanban" },
  { id: "view-heatmap", label: "Switch to Heatmap view", icon: Flame, action: "view-heatmap" },
  { id: "filter-out-of-stock", label: "Filter: Out of stock", icon: AlertTriangle, action: "filter-out-of-stock" },
  { id: "filter-low-stock", label: "Filter: Low stock", icon: TrendingDown, action: "filter-low-stock" },
  { id: "stock-take", label: "Start stock take", icon: ClipboardCheck, action: "stock-take" },
  { id: "export", label: "Export products", icon: Download, action: "export" },
  { id: "import", label: "Import products", icon: Upload, action: "import" },
  { id: "reorder-dashboard", label: "Open reorder dashboard", icon: ShoppingCart, action: "reorder-dashboard" },
];

// =============================================
// HELPERS
// =============================================

function getRecentItems(): RecentItem[] {
  try {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentItem(item: RecentItem): void {
  try {
    const current = getRecentItems().filter((r) => r.id !== item.id);
    const updated = [item, ...current].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

// =============================================
// COMPONENT
// =============================================

export function CommandPalette({ isOpen, onClose, onAction }: CommandPaletteProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load recent items on open
  useEffect(() => {
    if (isOpen) {
      setRecentItems(getRecentItems());
      setQuery("");
      setActiveIndex(0);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // =============================================
  // DATA FETCHING
  // =============================================

  const { data: products = [] } = useQuery<ProductResult[]>({
    queryKey: ["command-palette-products", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, price, image_url")
        .eq("tenant_id", tenantId)
        .eq("is_archived", false)
        .order("name")
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!tenantId,
    staleTime: 30_000,
  });

  const { data: categories = [] } = useQuery<CategoryResult[]>({
    queryKey: ["command-palette-categories", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;

      // Get product counts per category
      const { data: counts } = await supabase
        .from("products")
        .select("category_id")
        .eq("tenant_id", tenantId)
        .eq("is_archived", false);

      const countMap: Record<string, number> = {};
      (counts || []).forEach((p: { category_id: string | null }) => {
        if (p.category_id) {
          countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
        }
      });

      return (data || []).map((cat) => ({
        ...cat,
        product_count: countMap[cat.id] || 0,
      }));
    },
    enabled: isOpen && !!tenantId,
    staleTime: 30_000,
  });

  // =============================================
  // FUSE INSTANCES
  // =============================================

  const productFuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ["name", "sku"],
        threshold: 0.3,
        distance: 100,
      }),
    [products]
  );

  const actionFuse = useMemo(
    () =>
      new Fuse(ACTIONS, {
        keys: ["label"],
        threshold: 0.4,
        distance: 80,
      }),
    []
  );

  const categoryFuse = useMemo(
    () =>
      new Fuse(categories, {
        keys: ["name"],
        threshold: 0.3,
        distance: 100,
      }),
    [categories]
  );

  // =============================================
  // SEARCH RESULTS
  // =============================================

  const flatResults: ResultItem[] = useMemo(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      // Show recent items when query is empty
      const recent: ResultItem[] = recentItems.map((item) => ({
        section: "recent" as const,
        data: item,
      }));
      const actionItems: ResultItem[] = ACTIONS.slice(0, MAX_RESULTS).map((a) => ({
        section: "actions" as const,
        data: a,
      }));
      return [...recent, ...actionItems];
    }

    const productResults: ResultItem[] = productFuse
      .search(trimmed, { limit: MAX_RESULTS })
      .map((r) => ({ section: "products" as const, data: r.item }));

    const actionResults: ResultItem[] = actionFuse
      .search(trimmed, { limit: MAX_RESULTS })
      .map((r) => ({ section: "actions" as const, data: r.item }));

    const categoryResults: ResultItem[] = categoryFuse
      .search(trimmed, { limit: MAX_RESULTS })
      .map((r) => ({ section: "categories" as const, data: r.item }));

    return [...productResults, ...actionResults, ...categoryResults];
  }, [query, recentItems, productFuse, actionFuse, categoryFuse]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [flatResults.length, query]);

  // =============================================
  // SELECTION HANDLER
  // =============================================

  const handleSelect = useCallback(
    (item: ResultItem) => {
      switch (item.section) {
        case "recent": {
          const recent = item.data as RecentItem;
          addRecentItem(recent);
          onAction({ type: "product", id: recent.id });
          break;
        }
        case "products": {
          const product = item.data as ProductResult;
          addRecentItem({
            id: product.id,
            name: product.name,
            sku: product.sku,
            image_url: product.image_url,
          });
          setRecentItems(getRecentItems());
          onAction({ type: "product", id: product.id });
          break;
        }
        case "actions": {
          const action = item.data as ActionItem;
          onAction({ type: "action", action: action.action });
          break;
        }
        case "categories": {
          const category = item.data as CategoryResult;
          onAction({ type: "category", id: category.id });
          break;
        }
      }
      onClose();
    },
    [onAction, onClose]
  );

  // =============================================
  // KEYBOARD NAVIGATION
  // =============================================

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setActiveIndex((prev) => {
            const next = Math.min(prev + 1, flatResults.length - 1);
            itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
            return next;
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
            return next;
          });
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (flatResults[activeIndex]) {
            handleSelect(flatResults[activeIndex]);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [flatResults, activeIndex, handleSelect, onClose]
  );

  // =============================================
  // SECTION HEADERS
  // =============================================

  function getSectionLabel(section: string): string {
    switch (section) {
      case "recent":
        return "RECENT";
      case "products":
        return "PRODUCTS";
      case "actions":
        return "ACTIONS";
      case "categories":
        return "CATEGORIES";
      default:
        return section.toUpperCase();
    }
  }

  // Build grouped layout with section headers
  const groupedItems = useMemo(() => {
    const items: Array<{ type: "header"; label: string } | { type: "item"; item: ResultItem; index: number }> = [];
    let lastSection = "";
    flatResults.forEach((result, index) => {
      if (result.section !== lastSection) {
        items.push({ type: "header", label: getSectionLabel(result.section) });
        lastSection = result.section;
      }
      items.push({ type: "item", item: result, index });
    });
    return items;
  }, [flatResults]);

  // =============================================
  // RENDER
  // =============================================

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-2xl mx-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onKeyDown={handleKeyDown}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
              <Search className="w-5 h-5 text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("products.command.placeholder") || "Type a command or search products..."}
                className="flex-1 bg-transparent text-lg text-[var(--foreground)] placeholder:text-muted outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted bg-[var(--background)] rounded-md border border-[var(--card-border)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto overscroll-contain py-2">
              {groupedItems.length === 0 && query.trim() && (
                <div className="px-4 py-8 text-center text-muted text-sm">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}

              {groupedItems.map((entry, i) => {
                if (entry.type === "header") {
                  return (
                    <div
                      key={`header-${entry.label}`}
                      className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-muted uppercase select-none"
                    >
                      {entry.label}
                    </div>
                  );
                }

                const { item, index } = entry;
                const isActive = index === activeIndex;

                return (
                  <div
                    key={`${item.section}-${item.section === "actions" ? (item.data as ActionItem).id : (item.data as { id: string }).id}`}
                    ref={(el) => {
                      if (el) itemRefs.current.set(index, el);
                      else itemRefs.current.delete(index);
                    }}
                    className={cn(
                      "mx-2 px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-colors",
                      isActive
                        ? "bg-[var(--pastel-yellow)]/30"
                        : "hover:bg-[var(--background)]"
                    )}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <ResultItemContent item={item} />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--card-border)] text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                <ArrowDown className="w-3 h-3" />
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="w-3 h-3" />
                select
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1 py-0.5 text-[10px] bg-[var(--background)] rounded border border-[var(--card-border)]">esc</kbd>
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================
// RESULT ITEM RENDERER
// =============================================

function ResultItemContent({ item }: { item: ResultItem }) {
  switch (item.section) {
    case "recent": {
      const recent = item.data as RecentItem;
      return (
        <>
          <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center overflow-hidden shrink-0">
            {recent.image_url ? (
              <img
                src={recent.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Clock className="w-4 h-4 text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--foreground)] truncate">
              {recent.name}
            </div>
            {recent.sku && (
              <div className="text-xs text-muted truncate">{recent.sku}</div>
            )}
          </div>
          <span className="text-[10px] text-muted shrink-0">Recent</span>
        </>
      );
    }

    case "products": {
      const product = item.data as ProductResult;
      return (
        <>
          <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center overflow-hidden shrink-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-4 h-4 text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--foreground)] truncate">
              {product.name}
            </div>
            {product.sku && (
              <div className="text-xs text-muted truncate">{product.sku}</div>
            )}
          </div>
          <span className="text-sm font-medium text-muted shrink-0">
            {formatIQD(product.price)}
          </span>
        </>
      );
    }

    case "actions": {
      const action = item.data as ActionItem;
      const Icon = action.icon;
      return (
        <>
          <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--foreground)] truncate">
              {action.label}
            </div>
          </div>
          <span className="text-[10px] text-muted shrink-0">Action</span>
        </>
      );
    }

    case "categories": {
      const category = item.data as CategoryResult;
      return (
        <>
          <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center shrink-0">
            <Tag className="w-4 h-4 text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--foreground)] truncate">
              {category.name}
            </div>
            <div className="text-xs text-muted">
              {category.product_count} product{category.product_count !== 1 ? "s" : ""}
            </div>
          </div>
          <span className="text-[10px] text-muted shrink-0">Category</span>
        </>
      );
    }

    default:
      return null;
  }
}
