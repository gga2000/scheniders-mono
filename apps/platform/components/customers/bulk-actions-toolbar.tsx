"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Tag, MessageCircle, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerBulkActionsToolbarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onAddTags?: () => void;
    onExport?: () => void;
    onBroadcastMsg?: () => void;
}

export function CustomerBulkActionsToolbar({
    selectedCount,
    onClearSelection,
    onAddTags,
    onExport,
    onBroadcastMsg
}: CustomerBulkActionsToolbarProps) {
    const { t } = useLanguage();
    const { toast } = useToast();

    const handleAction = (actionName: string, customAction?: () => void) => {
        if (customAction) {
            customAction();
        } else {
            toast({
                title: `${actionName} action triggered`,
                description: `This feature will be fully implemented soon for ${selectedCount} customers.`,
                variant: "default",
            });
            onClearSelection();
        }
    };

    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 100, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 100, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-2 pr-4 bg-[var(--ink)] text-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-white/10 backdrop-blur-md"
                >
                    {/* Selection Count Badge */}
                    <div className="flex items-center gap-2 pl-2 border-r border-white/20 pr-4">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-xs font-bold font-mono">
                            {selectedCount}
                        </span>
                        <span className="text-sm font-medium tracking-wide">Selected</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleAction("Tags", onAddTags)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                            <Tag className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Tags</span>
                        </button>

                        <button
                            onClick={() => handleAction("Broadcast Message", onBroadcastMsg)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="hidden sm:inline">Message</span>
                        </button>

                        <button
                            onClick={() => handleAction("Export", onExport)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export</span>
                        </button>
                    </div>

                    {/* Clear Button */}
                    <div className="pl-2 border-l border-white/20">
                        <button
                            onClick={onClearSelection}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                            aria-label="Clear selection"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
