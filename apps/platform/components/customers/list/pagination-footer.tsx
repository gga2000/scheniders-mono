"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface PaginationFooterProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalCount: number;
}

export function PaginationFooter({ currentPage, totalPages, onPageChange, totalCount }: PaginationFooterProps) {
    const { t } = useLanguage();

    if (totalPages <= 1) return null;

    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push("...");
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }
        if (currentPage < totalPages - 2) pages.push("...");
        pages.push(totalPages);
    }

    return (
        <div className="mt-12 flex justify-between items-center bg-(--card-bg) rounded-[3rem] p-4 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]">
            <span className="text-sm font-semibold text-muted-foreground">
                {t("customers.pagination.pageOf")
                    .replace("{current}", currentPage.toLocaleString("en-US"))
                    .replace("{total}", totalPages.toLocaleString("en-US"))}
            </span>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-muted/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                {pages.map((page, i) =>
                    page === "..." ? (
                        <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
                    ) : (
                        <button
                            key={page}
                            onClick={() => onPageChange(page as number)}
                            className={
                                currentPage === page
                                    ? "w-10 h-10 rounded-2xl bg-foreground text-background font-bold text-sm tabular-nums"
                                    : "w-10 h-10 rounded-2xl hover:bg-muted/50 text-foreground font-bold text-sm tabular-nums"
                            }
                        >
                            {(page as number).toLocaleString("en-US")}
                        </button>
                    )
                )}

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-muted/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
