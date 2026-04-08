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
                        className="relative z-10 w-full max-w-[900px] h-full lg:h-[80vh] bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Film Grain / Noise Overlay */}
                        <div
                            className="absolute inset-0 z-0 opacity-[0.015] pointer-events-none mix-blend-overlay"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
                        />

                        {/* Ambient Deep Glows */}
                        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none z-0" />
                        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none z-0" />

                        <button
                            onClick={onClose}
                            className="absolute top-5 right-5 z-50 p-2 rounded-full bg-[var(--background)]/80 backdrop-blur shadow-sm border border-[var(--card-border)] hover:bg-[var(--card-border)] text-muted hover:text-foreground transition-all"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex-1 overflow-y-auto w-full h-full relative z-10 pb-6" id="customer-profile-scroll-container">
                            <CustomerProfilePanel customerSummary={customer} />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
