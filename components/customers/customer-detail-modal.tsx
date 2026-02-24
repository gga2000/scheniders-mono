"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { CustomerProfilePanel } from "@/components/customers/customer-profile-panel";

interface CustomerDetailModalProps {
    customer: PaginatedCustomer | null;
    isOpen: boolean;
    onClose: () => void;
}

export function CustomerDetailModal({ customer, isOpen, onClose }: CustomerDetailModalProps) {
    return (
        <AnimatePresence>
            {isOpen && customer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="relative z-10 w-full max-w-5xl h-full lg:h-[90vh] bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-[var(--background)]/80 backdrop-blur shadow-sm border border-[var(--card-border)] hover:bg-[var(--card-border)] text-muted hover:text-foreground transition-all"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex-1 overflow-y-auto w-full h-full relative" id="customer-profile-scroll-container">
                            <CustomerProfilePanel customerSummary={customer} />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
