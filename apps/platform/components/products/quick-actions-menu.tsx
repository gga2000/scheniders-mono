"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical, Edit, Archive, ArchiveRestore, Eye, ShoppingBag, Trash2, Copy } from "lucide-react";
import { Product } from "@/lib/supabase";

interface QuickActionsMenuProps {
    product: Product;
    onEdit: () => void;
    onArchive: () => void;
    onRestore?: () => void;
    onViewDetails: () => void;
    onViewOrders: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
}

export function QuickActionsMenu({
    product,
    onEdit,
    onArchive,
    onRestore,
    onViewDetails,
    onViewOrders,
    onDuplicate,
    onDelete,
}: QuickActionsMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    const menuItems = [
        {
            label: "View Details",
            icon: Eye,
            onClick: onViewDetails,
            show: true,
        },
        {
            label: "Edit Product",
            icon: Edit,
            onClick: onEdit,
            show: true,
        },
        {
            label: "View Orders",
            icon: ShoppingBag,
            onClick: onViewOrders,
            show: true,
        },
        {
            label: "Duplicate",
            icon: Copy,
            onClick: onDuplicate,
            show: !!onDuplicate && !product.is_archived,
        },
        {
            label: product.is_archived ? "Restore" : "Archive",
            icon: product.is_archived ? ArchiveRestore : Archive,
            onClick: product.is_archived ? onRestore : onArchive,
            show: true,
            className: product.is_archived ? "text-green-600" : "text-amber-600",
        },
        {
            label: "Delete Permanently",
            icon: Trash2,
            onClick: onDelete,
            show: !!onDelete && product.is_archived,
            className: "text-rose-600",
        },
    ].filter((item) => item.show);

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
            >
                <MoreVertical className="w-4 h-4 text-muted" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 z-50 w-48 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] overflow-hidden"
                    >
                        {menuItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    item.onClick?.();
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-[var(--background)] transition-colors ${item.className || "text-foreground"
                                    }`}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
