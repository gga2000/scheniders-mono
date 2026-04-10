"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  LayoutDashboard,
  CreditCard,
  Clock,
  Activity,
  FileText,
  Settings,
  TrendingUp,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
  category: "page" | "action" | "merchant";
}

const PAGES: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", sublabel: "Command Center", icon: <LayoutDashboard className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "merchants", label: "Merchants", sublabel: "All merchants", icon: <Building2 className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "billing", label: "Billing", sublabel: "Wallets & transactions", icon: <CreditCard className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "trials", label: "Trials", sublabel: "Trial management", icon: <Clock className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "health", label: "Health", sublabel: "Platform health", icon: <Activity className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "activity", label: "Activity Log", sublabel: "Admin actions", icon: <FileText className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "settings", label: "Settings", sublabel: "Platform settings", icon: <Settings className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "revenue", label: "Revenue Analytics", sublabel: "MRR, cohorts, LTV", icon: <TrendingUp className="w-4 h-4" />, action: () => {}, category: "page" },
  { id: "usage", label: "Usage Heatmap", sublabel: "Activity patterns", icon: <BarChart3 className="w-4 h-4" />, action: () => {}, category: "page" },
];

const PAGE_ROUTES: Record<string, string> = {
  dashboard: "/",
  merchants: "/merchants",
  billing: "/billing",
  trials: "/trials",
  health: "/health",
  activity: "/activity",
  settings: "/settings",
  revenue: "/revenue",
  usage: "/usage",
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build items with router-aware actions
  const items = useMemo(() => {
    return PAGES.map((page) => ({
      ...page,
      action: () => {
        router.push(PAGE_ROUTES[page.id] || "/");
        onClose();
      },
    }));
  }, [router, onClose]);

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedIndex, onClose],
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

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
            className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-lg"
          >
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
                <Search className="w-4 h-4 text-foreground/40 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages, merchants, actions..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 outline-none"
                />
                <kbd className="text-[10px] text-foreground/30 bg-foreground/5 px-1.5 py-0.5 rounded font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[300px] overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-foreground/40">
                    No results found
                  </div>
                ) : (
                  filtered.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex
                          ? "bg-foreground/5 text-foreground"
                          : "text-foreground/70 hover:bg-foreground/[0.02]"
                      }`}
                    >
                      <span className="text-foreground/50">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {item.sublabel && (
                          <p className="text-[11px] text-foreground/40 truncate">
                            {item.sublabel}
                          </p>
                        )}
                      </div>
                      {i === selectedIndex && (
                        <ArrowRight className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--card-border)] bg-foreground/[0.02]">
                <div className="flex items-center gap-2 text-[10px] text-foreground/30">
                  <span>Navigate</span>
                  <kbd className="bg-foreground/5 px-1 py-0.5 rounded font-mono">↑↓</kbd>
                  <span>Select</span>
                  <kbd className="bg-foreground/5 px-1 py-0.5 rounded font-mono">↵</kbd>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      handler: () => setIsOpen((v) => !v),
    },
  ]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
