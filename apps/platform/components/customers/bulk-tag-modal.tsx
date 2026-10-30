"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag as TagIcon, Search, AlertTriangle } from "lucide-react";
import { useCustomerTags } from "@/hooks/use-customer-management";
import { tagColorClasses } from "@/types/customer";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BulkTagModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (tagIds: string[]) => Promise<void>;
    selectedCount: number;
    isLoading?: boolean;
}

export function BulkTagModal({ isOpen, onClose, onConfirm, selectedCount, isLoading }: BulkTagModalProps) {
    const { t } = useLanguage();
    const { tags } = useCustomerTags();
    const [search, setSearch] = useState("");
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

    if (!isOpen) return null;

    const filteredTags = tags.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
    );

    const toggleTag = (id: string) => {
        const next = new Set(selectedTagIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTagIds(next);
    };

    const handleConfirm = async () => {
        if (selectedTagIds.size === 0) return;
        await onConfirm(Array.from(selectedTagIds));
        setSelectedTagIds(new Set()); // Reset on success closing will be handled parent
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                >
                    <div className="p-5 border-b border-[var(--card-border)] flex items-center justify-between bg-[var(--background)]">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <TagIcon className="w-5 h-5 text-[var(--ink)]" />
                                {t("customers.bulkTag.title")}
                            </h2>
                            <p className="text-sm text-muted mt-1">
                                {t("customers.bulkTag.subtitle", { count: selectedCount.toLocaleString("en-US") })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label={t("customers.bulk.cancel")}
                            className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-[var(--card-border)] transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 flex-1 overflow-visible">
                        {/* Search Input */}
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                                type="text"
                                placeholder={t("customers.bulkTag.search")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)] focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Tag List */}
                        <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {filteredTags.length === 0 ? (
                                <div className="text-center py-8 text-muted text-sm">
                                    {t("customers.bulkTag.empty")}
                                </div>
                            ) : (
                                filteredTags.map((tag) => {
                                    const isSelected = selectedTagIds.has(tag.id);
                                    const colorTheme = tagColorClasses[tag.color] ?? tagColorClasses.gray;
                                    return (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleTag(tag.id)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                                isSelected
                                                    ? "bg-[var(--background)] border-[var(--ink)]" // Selected state border
                                                    : "bg-[var(--background)] border-transparent hover:border-[var(--card-border)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Checkbox circle */}
                                                <div className={cn(
                                                    "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                                    isSelected ? "bg-[var(--ink)] border-[var(--ink)] text-white" : "border-[var(--foreground-subtle)]"
                                                )}>
                                                    {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>

                                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", colorTheme.bg, colorTheme.text)}>
                                                    {tag.name}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="p-5 border-t border-[var(--card-border)] bg-[var(--background)] flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground hover:bg-[var(--card-border)] font-medium rounded-xl transition-all"
                            disabled={isLoading}
                        >
                            {t("customers.bulk.cancel")}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selectedTagIds.size === 0 || isLoading}
                            className="flex-1 py-2.5 px-4 bg-[var(--ink)] text-white font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                t("customers.bulkTag.apply", { count: String(selectedTagIds.size) })
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
