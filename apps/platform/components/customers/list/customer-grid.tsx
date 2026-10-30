"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CustomerCard } from "@/components/customers/customer-card";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

interface CustomerGridProps {
    customers: PaginatedCustomer[];
    onCustomerClick: (phone: string) => void;
    selectedPhones?: Set<string>;
    onToggleSelect?: (phone: string) => void;
}

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.03 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

export function CustomerGrid({ customers, onCustomerClick, selectedPhones, onToggleSelect }: CustomerGridProps) {
    // Once something is selected, a tap selects instead of opening, so the
    // selection can be built on a phone without hunting for the checkbox.
    const selecting = !!onToggleSelect && (selectedPhones?.size ?? 0) > 0;
    return (
        <motion.div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <AnimatePresence mode="popLayout">
                {customers.map((customer, index) => (
                    <motion.div
                        key={customer.phone}
                        variants={itemVariants}
                        exit="exit"
                        layout
                        style={{ animationDelay: `${Math.min(index * 0.03, 0.5)}s` }}
                    >
                        <CustomerCard
                            customer={customer}
                            onClick={() => (selecting ? onToggleSelect?.(customer.phone) : onCustomerClick(customer.phone))}
                            isSelected={selectedPhones?.has(customer.phone)}
                            onToggleSelect={onToggleSelect ? () => onToggleSelect(customer.phone) : undefined}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </motion.div>
    );
}
