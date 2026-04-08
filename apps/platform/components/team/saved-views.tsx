"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bookmark,
    BookmarkPlus,
    X,
    Check,
    Trash2,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
export interface SavedView {
    id: string;
    name: string;
    filters: {
        timeRange: "today" | "week" | "month" | "all";
        actionFilter: string;
        searchQuery: string;
    };
    createdAt: string;
}

interface SavedViewsProps {
    currentFilters: SavedView["filters"];
    onApplyView: (filters: SavedView["filters"]) => void;
    className?: string;
}

const STORAGE_KEY = "team-saved-views";

export function useSavedViews() {
    const [views, setViews] = useState<SavedView[]>([]);

    // Load from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setViews(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse saved views:", e);
            }
        }
    }, []);

    // Save to localStorage
    const saveToStorage = useCallback((newViews: SavedView[]) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newViews));
        setViews(newViews);
    }, []);

    const addView = useCallback(
        (name: string, filters: SavedView["filters"]) => {
            const newView: SavedView = {
                id: `view-${Date.now()}`,
                name,
                filters,
                createdAt: new Date().toISOString(),
            };
            saveToStorage([...views, newView]);
            return newView;
        },
        [views, saveToStorage]
    );

    const deleteView = useCallback(
        (id: string) => {
            saveToStorage(views.filter((v) => v.id !== id));
        },
        [views, saveToStorage]
    );

    return { views, addView, deleteView };
}

export function SavedViews({
    currentFilters,
    onApplyView,
    className,
}: SavedViewsProps) {
    const { views, addView, deleteView } = useSavedViews();
    const [isAdding, setIsAdding] = useState(false);
    const [newViewName, setNewViewName] = useState("");
    const [activeViewId, setActiveViewId] = useState<string | null>(null);

    const handleSaveView = () => {
        if (!newViewName.trim()) return;
        const newView = addView(newViewName.trim(), currentFilters);
        setActiveViewId(newView.id);
        setNewViewName("");
        setIsAdding(false);
    };

    const handleApplyView = (view: SavedView) => {
        setActiveViewId(view.id);
        onApplyView(view.filters);
    };

    // Get filter description
    const getFilterDescription = (filters: SavedView["filters"]) => {
        const parts: string[] = [];
        const timeLabels = {
            today: "اليوم",
            week: "الأسبوع",
            month: "الشهر",
            all: "الكل",
        };
        parts.push(timeLabels[filters.timeRange]);
        if (filters.actionFilter !== "all") {
            parts.push(filters.actionFilter.split(".")[1]);
        }
        return parts.join(" • ");
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">العروض المحفوظة</span>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                    <BookmarkPlus className="w-3 h-3" />
                    حفظ
                </button>
            </div>

            {/* Add new view form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-xl">
                            <input
                                type="text"
                                value={newViewName}
                                onChange={(e) => setNewViewName(e.target.value)}
                                placeholder="اسم العرض..."
                                className="flex-1 px-3 py-2 text-sm bg-background rounded-lg border-0 focus:ring-2 focus:ring-primary/20 outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveView();
                                    if (e.key === "Escape") setIsAdding(false);
                                }}
                            />
                            <button
                                onClick={handleSaveView}
                                disabled={!newViewName.trim()}
                                className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setIsAdding(false);
                                    setNewViewName("");
                                }}
                                className="p-2 rounded-lg hover:bg-muted transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Saved views list */}
            {views.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                    لا توجد عروض محفوظة
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {views.map((view) => (
                        <motion.div
                            key={view.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="group relative"
                        >
                            <button
                                onClick={() => handleApplyView(view)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
                                    "border transition-all duration-200",
                                    activeViewId === view.id
                                        ? "bg-primary/10 border-primary/30 text-primary"
                                        : "bg-muted/30 border-border/50 hover:bg-muted/50"
                                )}
                            >
                                <Bookmark
                                    className={cn(
                                        "w-3 h-3",
                                        activeViewId === view.id && "fill-primary"
                                    )}
                                />
                                <span className="font-medium">{view.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {getFilterDescription(view.filters)}
                                </span>
                            </button>

                            {/* Delete button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteView(view.id);
                                    if (activeViewId === view.id) {
                                        setActiveViewId(null);
                                    }
                                }}
                                className="absolute -top-1 -right-1 p-1 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
