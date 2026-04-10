"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, X, Pencil, Copy, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/use-admin-store";
import type { SavedView } from "@/types/admin";

export function MerchantSavedViews() {
  const {
    savedViews,
    activeViewId,
    setActiveView,
    addSavedView,
    updateSavedView,
    removeSavedView,
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    searchQuery,
    dateRange,
    sortConfig,
    hiddenColumns,
    setPlanFilter,
    setStatusFilter,
    setCityFilter,
    setBalanceFilter,
    setHealthFilter,
    setSearchQuery,
    setDateRange,
  } = useAdminStore();

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuId) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenuId]);

  // Focus inputs
  useEffect(() => {
    if (renameId) renameInputRef.current?.focus();
  }, [renameId]);
  useEffect(() => {
    if (showNewInput) newInputRef.current?.focus();
  }, [showNewInput]);

  // Apply view filters when switching tabs
  const handleSwitchView = (view: SavedView) => {
    setActiveView(view.id);
    setPlanFilter(view.filters.planFilter);
    setStatusFilter(view.filters.statusFilter);
    setCityFilter(view.filters.cityFilter);
    setBalanceFilter(view.filters.balanceFilter);
    setHealthFilter(view.filters.healthFilter);
    if (view.filters.searchQuery !== undefined) setSearchQuery(view.filters.searchQuery);
    if (view.filters.dateRange) setDateRange(view.filters.dateRange);
  };

  // Create new view from current filters
  const handleCreateView = () => {
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}`;
    const view: SavedView = {
      id,
      name: newName.trim(),
      filters: {
        planFilter,
        statusFilter,
        cityFilter,
        balanceFilter,
        healthFilter,
        searchQuery,
        dateRange,
      },
      sort: sortConfig.length > 0 ? [...sortConfig] : undefined,
      columns: hiddenColumns.length > 0 ? [...hiddenColumns] : undefined,
    };
    addSavedView(view);
    setActiveView(id);
    setNewName("");
    setShowNewInput(false);
  };

  // Rename
  const handleRename = (id: string) => {
    if (!renameName.trim()) return;
    updateSavedView(id, { name: renameName.trim() });
    setRenameId(null);
  };

  // Duplicate
  const handleDuplicate = (view: SavedView) => {
    const newView: SavedView = {
      ...view,
      id: `custom-${Date.now()}`,
      name: `${view.name} (copy)`,
      isDefault: false,
    };
    addSavedView(newView);
    setContextMenuId(null);
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide relative">
      {savedViews.map((view) => {
        const isActive = activeViewId === view.id;
        const isRenaming = renameId === view.id;

        return (
          <div key={view.id} className="relative shrink-0">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(view.id);
                  if (e.key === "Escape") setRenameId(null);
                }}
                onBlur={() => handleRename(view.id)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-foreground/20 bg-[var(--card-bg)] outline-none ring-2 ring-foreground/10 min-w-[80px]"
              />
            ) : (
              <button
                onClick={() => handleSwitchView(view)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!view.isDefault || view.id !== "default-all") {
                    setContextMenuId(view.id);
                  }
                }}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap relative",
                  isActive
                    ? "text-foreground bg-[var(--card-bg)] shadow-sm"
                    : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.03]"
                )}
              >
                {view.name}
                {isActive && (
                  <motion.div
                    layoutId="viewIndicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            )}

            {/* Context menu */}
            {contextMenuId === view.id && (
              <div
                ref={contextRef}
                className="absolute top-full left-0 mt-1 w-36 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <button
                  onClick={() => {
                    setRenameName(view.name);
                    setRenameId(view.id);
                    setContextMenuId(null);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-foreground/[0.05] transition-colors flex items-center gap-2"
                >
                  <Pencil className="w-3 h-3" />
                  Rename
                </button>
                <button
                  onClick={() => handleDuplicate(view)}
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-foreground/[0.05] transition-colors flex items-center gap-2"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
                {!view.isDefault && (
                  <button
                    onClick={() => {
                      removeSavedView(view.id);
                      setContextMenuId(null);
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                  >
                    <X className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* New view input or button */}
      {showNewInput ? (
        <div className="shrink-0 flex items-center gap-1">
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateView();
              if (e.key === "Escape") { setShowNewInput(false); setNewName(""); }
            }}
            onBlur={() => {
              if (newName.trim()) handleCreateView();
              else { setShowNewInput(false); setNewName(""); }
            }}
            placeholder="View name..."
            className="px-2.5 py-1.5 text-xs rounded-lg border border-foreground/20 bg-[var(--card-bg)] outline-none ring-2 ring-foreground/10 min-w-[100px] placeholder:text-foreground/30"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowNewInput(true)}
          className="shrink-0 p-1.5 rounded-lg text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.03] transition-all"
          title="Save current filters as a new view"
          aria-label="Create new view"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
