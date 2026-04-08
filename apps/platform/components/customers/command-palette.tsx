"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Tag, MessageCircle, Phone, PackagePlus } from "lucide-react";
import { generateWhatsAppLink, cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface CommandPaletteProps {
    customerPhone: string;
}

export function CommandPalette({ customerPhone }: CommandPaletteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const { t } = useLanguage();

    // Handle Keyboard Shortcut (Cmd+K / Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const commands = [
        {
            id: "add_note",
            name: "Add a Note",
            icon: FileText,
            shortcut: "N",
            disabled: true,
            action: () => {
                setIsOpen(false);
            },
        },
        {
            id: "add_tag",
            name: "Manage Tags",
            icon: Tag,
            shortcut: "T",
            disabled: true,
            action: () => {
                setIsOpen(false);
            },
        },
        {
            id: "message",
            name: "Send WhatsApp Message",
            icon: MessageCircle,
            shortcut: "M",
            action: () => {
                const link = generateWhatsAppLink(customerPhone, `Hello!`);
                window.open(link, "_blank");
                setIsOpen(false);
            },
        },
        {
            id: "call",
            name: "Call Customer",
            icon: Phone,
            shortcut: "C",
            action: () => {
                window.location.href = `tel:${customerPhone}`;
                setIsOpen(false);
            },
        },
        {
            id: "new_order",
            name: "Create New Order",
            icon: PackagePlus,
            shortcut: "O",
            disabled: true,
            action: () => {
                setIsOpen(false);
            },
        }
    ];

    const filteredCommands = query === ""
        ? commands
        : commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.15 }}
                        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[101] bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--card-border)]"
                    >
                        {/* Search Input */}
                        <div className="flex items-center px-4 py-4 border-b border-[var(--card-border)]">
                            <Search className="w-5 h-5 text-muted mr-3" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Type a command or search..."
                                className="flex-1 bg-transparent text-foreground placeholder:text-muted outline-none text-lg"
                            />
                            <div className="flex gap-1 ml-3">
                                <kbd className="hidden sm:inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-muted bg-[var(--background)] border border-[var(--card-border)] rounded">
                                    ESC
                                </kbd>
                            </div>
                        </div>

                        {/* Command List */}
                        <div className="max-h-[300px] overflow-y-auto p-2">
                            {filteredCommands.length === 0 ? (
                                <div className="p-4 text-center text-muted">No commands found.</div>
                            ) : (
                                filteredCommands.filter(c => !c.disabled).map((command, index) => (
                                    <button
                                        key={command.id}
                                        onClick={command.action}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3 rounded-2xl transition-colors",
                                            "hover:bg-[var(--pastel-yellow)] hover:text-amber-900 group"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 text-foreground group-hover:text-amber-900">
                                            <div className="w-8 h-8 rounded-xl bg-[var(--background)] group-hover:bg-white/50 flex items-center justify-center transition-colors">
                                                <command.icon className="w-4 h-4" />
                                            </div>
                                            <span className="font-medium text-sm">{command.name}</span>
                                        </div>
                                        <kbd className="hidden sm:inline-flex items-center justify-center w-6 h-6 text-xs font-semibold text-muted group-hover:text-amber-700 bg-[var(--background)] group-hover:bg-white/50 rounded-lg transition-colors">
                                            {command.shortcut}
                                        </kbd>
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="p-3 bg-[var(--background)] border-t border-[var(--card-border)] text-xs text-center text-muted">
                            Quick Actions for <span className="font-mono font-medium">{customerPhone}</span>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

