"use client";

import { useState } from "react";
import { FilterPreset } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    Bookmark,
    Plus,
    X,
    Check,
    Trash2,
    Star,
} from "lucide-react";

interface SavedViewsTabsProps {
    presets: FilterPreset[];
    activePresetId: string | null;
    onSelect: (presetId: string) => void;
    onSave: (name: string) => void;
    onDelete: (presetId: string) => void;
    onClearFilter: () => void;
}

export function SavedViewsTabs({
    presets,
    activePresetId,
    onSelect,
    onSave,
    onDelete,
    onClearFilter,
}: SavedViewsTabsProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [showDelete, setShowDelete] = useState<string | null>(null);

    const handleSave = () => {
        if (newName.trim()) {
            onSave(newName.trim());
            setNewName("");
            setIsCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave();
        } else if (e.key === "Escape") {
            setIsCreating(false);
            setNewName("");
        }
    };

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {/* All Orders Tab */}
            <button
                onClick={onClearFilter}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                    activePresetId === null
                        ? "bg-[var(--foreground)] text-white shadow-md"
                        : "bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                )}
            >
                <Star className="w-3.5 h-3.5" />
                All Orders
            </button>

            {/* Preset Tabs */}
            <AnimatePresence mode="popLayout">
                {presets.map((preset) => (
                    <motion.div
                        key={preset.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative"
                        onMouseEnter={() => setShowDelete(preset.id)}
                        onMouseLeave={() => setShowDelete(null)}
                    >
                        <button
                            onClick={() => onSelect(preset.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                                activePresetId === preset.id
                                    ? "bg-[var(--pastel-yellow)] text-amber-900 shadow-md"
                                    : "bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)]"
                            )}
                        >
                            <Bookmark className="w-3.5 h-3.5" />
                            {preset.name}
                        </button>

                        {/* Delete button on hover */}
                        <AnimatePresence>
                            {showDelete === preset.id && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(preset.id);
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600"
                                >
                                    <X className="w-3 h-3" />
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Create New Preset Button / Input */}
            <AnimatePresence mode="wait">
                {isCreating ? (
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center gap-1"
                    >
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="View name..."
                            autoFocus
                            className="w-32 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                        <button
                            onClick={handleSave}
                            disabled={!newName.trim()}
                            className="p-2 rounded-xl bg-[var(--pastel-green)] text-green-800 disabled:opacity-50 hover:bg-[var(--pastel-green-dark)]"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => {
                                setIsCreating(false);
                                setNewName("");
                            }}
                            className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                ) : (
                    <motion.button
                        key="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap bg-[var(--card-bg)] border border-dashed border-[var(--card-border)] text-muted hover:bg-[var(--background)] hover:border-solid transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Save View
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
