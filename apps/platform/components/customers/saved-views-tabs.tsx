"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    Bookmark,
    Plus,
    X,
    Check,
    Trash2,
    Star,
    ChevronDown,
} from "lucide-react";

export interface CustomerFilterPreset {
    id: string;
    name: string;
    filters: any; // JSONB filters object
    user_id?: string | null;
    created_at: string;
    updated_at: string;
}

interface SavedCustomerViewsTabsProps {
    presets: CustomerFilterPreset[];
    activePresetId: string | null;
    onSelect: (presetId: string) => void;
    onSave: (name: string) => void;
    onDelete: (presetId: string) => void;
    onClearFilter: () => void;
}

export function SavedCustomerViewsTabs({
    presets,
    activePresetId,
    onSelect,
    onSave,
    onDelete,
    onClearFilter,
}: SavedCustomerViewsTabsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [showDelete, setShowDelete] = useState<string | null>(null);
    const { t } = useLanguage();

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
            setIsOpen(false);
        }
    };

    // Find active preset name
    const activePresetName = activePresetId
        ? presets.find(p => p.id === activePresetId)?.name
        : (t("customers.views.allCustomers") || "All Customers");

    return (
        <div className="relative z-10">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 shadow-sm border",
                    isOpen
                        ? "bg-white/80 ring-2 ring-primary/20 border-primary/30 text-primary dark:bg-[#2A2A2A] dark:border-[rgba(239,255,0,0.3)] dark:ring-[rgba(239,255,0,0.15)] dark:text-[#EFFF00]"
                        : "bg-white/60 backdrop-blur-md border-white/20 text-muted-foreground hover:bg-white/80 hover:text-foreground dark:bg-[#1E1E1E] dark:border-[#333333] dark:text-[#A1A1A1] dark:hover:bg-[#2A2A2A] dark:hover:text-white dark:hover:border-[#555]"
                )}
            >
                {activePresetId === null ? (
                    <Star className="w-4 h-4 text-[#EFFF00] fill-[#EFFF00] drop-shadow-[0_0_4px_rgba(239,255,0,0.25)]" />
                ) : (
                    <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500" />
                )}
                <span>{activePresetName}</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isOpen ? "rotate-180" : "")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop to close */}
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown Menu */}
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="absolute left-0 mt-2 w-72 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl z-20 flex flex-col gap-1 dark:bg-[#1E1E1E] dark:border-[#333333] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                        >
                            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t("customers.views.switchView") || "Switch View"}
                            </div>

                            {/* All Customers Option */}
                            <button
                                onClick={() => {
                                    onClearFilter();
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                    activePresetId === null
                                        ? "bg-primary/10 text-primary dark:bg-[rgba(239,255,0,0.1)] dark:text-[#EFFF00]"
                                        : "hover:bg-black/5 text-foreground dark:hover:bg-white/5 dark:text-[#D4D4D4]"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Star className={cn("w-4 h-4", activePresetId === null ? "fill-primary text-primary" : "text-muted-foreground")} />
                                    <span>{t("customers.views.allCustomers") || "All Customers"}</span>
                                </div>
                                {activePresetId === null && (
                                    <Check className="w-4 h-4 text-primary" />
                                )}
                            </button>

                            {/* Divider */}
                            {presets.length > 0 && (
                                <div className="h-px bg-border my-1" />
                            )}

                            {/* Saved Presets */}
                            {presets.map((preset) => (
                                <div
                                    key={preset.id}
                                    onMouseEnter={() => setShowDelete(preset.id)}
                                    onMouseLeave={() => setShowDelete(null)}
                                    className="relative group"
                                >
                                    <button
                                        onClick={() => {
                                            onSelect(preset.id);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                            activePresetId === preset.id
                                                ? "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400"
                                                : "hover:bg-black/5 text-foreground dark:hover:bg-white/5 dark:text-[#D4D4D4]"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <Bookmark className={cn(
                                                "w-4 h-4 flex-shrink-0",
                                                activePresetId === preset.id
                                                    ? "fill-amber-500 text-amber-500"
                                                    : "text-muted-foreground"
                                            )} />
                                            <span className="truncate">{preset.name}</span>
                                        </div>

                                        {activePresetId === preset.id && (
                                            <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                        )}
                                    </button>

                                    {/* Delete Button (only for user presets) */}
                                    {preset.user_id !== null && showDelete === preset.id && (
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(preset.id);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors dark:bg-rose-400/15 dark:text-rose-400 dark:hover:bg-rose-400/25"
                                            title="Delete preset"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                    )}
                                </div>
                            ))}

                            {/* Divider */}
                            <div className="h-px bg-border my-1" />

                            {/* Create New Preset */}
                            {isCreating ? (
                                <div className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={t("customers.views.presetName") || "Preset name..."}
                                            autoFocus
                                            className="flex-1 px-3 py-1.5 text-sm bg-white border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-[#2A2A2A] dark:border-[#444] dark:text-white"
                                        />
                                        <button
                                            onClick={handleSave}
                                            className="p-1.5 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 transition-colors dark:bg-green-400/15 dark:text-green-400 dark:hover:bg-green-400/25"
                                            title="Save preset"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsCreating(false);
                                                setNewName("");
                                            }}
                                            className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
                                            title="Cancel"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground transition-all dark:hover:bg-white/5 dark:hover:text-white"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>{t("customers.views.saveCurrentView") || "Save Current View"}</span>
                                </button>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
