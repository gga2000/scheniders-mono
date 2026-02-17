"use client";

import { useState } from "react";
import { FilterPreset } from "@/lib/supabase";
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
        : t("orders.views.allOrders");

    return (
        <div className="relative z-10">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 shadow-sm border",
                    isOpen
                        ? "bg-white/80 ring-2 ring-primary/20 border-primary/30 text-primary"
                        : "bg-white/60 backdrop-blur-md border-white/20 text-muted-foreground hover:bg-white/80 hover:text-foreground"
                )}
            >
                {activePresetId === null ? (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
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
                            className="absolute left-0 mt-2 w-72 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl z-20 flex flex-col gap-1"
                        >
                            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t("orders.views.switchView")}
                            </div>

                            {/* All Orders Option */}
                            <button
                                onClick={() => {
                                    onClearFilter();
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                    activePresetId === null
                                        ? "bg-primary/10 text-primary"
                                        : "hover:bg-black/5 text-foreground"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Star className={cn("w-4 h-4", activePresetId === null ? "fill-primary text-primary" : "text-muted-foreground")} />
                                    <span>{t("orders.views.allOrders")}</span>
                                </div>
                                {activePresetId === null && <Check className="w-4 h-4" />}
                            </button>

                            {/* Separator */}
                            <div className="h-px bg-black/5 my-1" />

                            {/* Presets List */}
                            <div className="max-h-60 overflow-y-auto scrollbar-hide flex flex-col gap-1">
                                {presets.map((preset) => (
                                    <div
                                        key={preset.id}
                                        className={cn(
                                            "group flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all relative overflow-hidden",
                                            activePresetId === preset.id
                                                ? "bg-amber-500/10 text-amber-700"
                                                : "hover:bg-black/5 text-foreground"
                                        )}
                                    >
                                        <button
                                            onClick={() => {
                                                onSelect(preset.id);
                                                setIsOpen(false);
                                            }}
                                            className="flex-1 flex items-center gap-2 text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Bookmark className={cn("w-4 h-4", activePresetId === preset.id ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                                                <span className="truncate">{preset.name}</span>
                                            </div>
                                        </button>

                                        {activePresetId === preset.id && <Check className="w-4 h-4 mr-2" />}

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(preset.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-rose-100 text-rose-500 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Separator */}
                            <div className="h-px bg-black/5 my-1" />

                            {/* Save New View */}
                            {isCreating ? (
                                <div className="p-2 bg-black/5 rounded-xl">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={t("orders.views.viewNamePlaceholder")}
                                        autoFocus
                                        className="w-full px-3 py-2 text-sm bg-white border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 mb-2"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSave}
                                            disabled={!newName.trim()}
                                            className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg disabled:opacity-50"
                                        >
                                            {t("orders.views.save")}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsCreating(false);
                                                setNewName("");
                                            }}
                                            className="px-3 py-1.5 bg-transparent border border-black/10 text-xs font-semibold rounded-lg"
                                        >
                                            {t("orders.views.cancel")}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>{t("orders.views.saveCurrentView")}</span>
                                </button>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div >
    );
}
