"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface ExportMenuProps {
    onExportCSV: () => void;
    onExportExcel: () => void;
    onPrintReport: () => void;
}

export function ExportMenu({ onExportCSV, onExportExcel, onPrintReport }: ExportMenuProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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
            label: t("products.exportMenu.csv"),
            icon: FileText,
            onClick: onExportCSV,
            description: t("products.exportMenu.csvHint"),
        },
        {
            label: t("products.exportMenu.excel"),
            icon: FileSpreadsheet,
            onClick: onExportExcel,
            description: t("products.exportMenu.excelHint"),
        },
        {
            label: t("products.exportMenu.print"),
            icon: Printer,
            onClick: onPrintReport,
            description: t("products.exportMenu.printHint"),
        },
    ];

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                type="button"
                aria-expanded={isOpen}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-[var(--background)] transition-colors"
            >
                <Download className="w-4 h-4" />
                {t("products.exportMenu.label")}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 z-50 w-56 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] overflow-hidden"
                    >
                        {menuItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    item.onClick();
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-start gap-3 px-4 py-3 text-start hover:bg-[var(--background)] transition-colors"
                            >
                                <item.icon className="w-5 h-5 text-muted mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                                    <p className="text-xs text-muted">{item.description}</p>
                                </div>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
