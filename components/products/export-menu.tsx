"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from "lucide-react";

interface ExportMenuProps {
    onExportCSV: () => void;
    onExportExcel: () => void;
    onPrintReport: () => void;
}

export function ExportMenu({ onExportCSV, onExportExcel, onPrintReport }: ExportMenuProps) {
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
            label: "Export as CSV",
            icon: FileText,
            onClick: onExportCSV,
            description: "Comma-separated values",
        },
        {
            label: "Export as Excel",
            icon: FileSpreadsheet,
            onClick: onExportExcel,
            description: "Microsoft Excel format",
        },
        {
            label: "Print Report",
            icon: Printer,
            onClick: onPrintReport,
            description: "Generate printable PDF",
        },
    ];

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--pastel-green)] text-green-800 rounded-xl font-medium hover:bg-[var(--pastel-mint)] transition-colors"
            >
                <Download className="w-4 h-4" />
                Export
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
                                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--background)] transition-colors"
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
