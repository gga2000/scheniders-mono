"use client";

import { motion } from "framer-motion";
import { Crown, TrendingUp, ShoppingBag, MessageCircle } from "lucide-react";
import { Customer } from "@/hooks/use-customers";
import { formatIQD, generateWhatsAppLink } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface TopSpendersListProps {
    customers: Customer[];
    onViewCustomer: (customer: Customer) => void;
}

export function TopSpendersList({ customers, onViewCustomer }: TopSpendersListProps) {
    const { t } = useLanguage();
    if (customers.length === 0) {
        return (
            <div className="py-8 text-center text-muted">
                No customers yet
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {customers.slice(0, 5).map((customer, index) => (
                <motion.div
                    key={customer.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--background)] transition-colors cursor-pointer group"
                    onClick={() => onViewCustomer(customer)}
                >
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${index === 0 ? "bg-amber-100 text-amber-700" :
                            index === 1 ? "bg-gray-200 text-gray-700" :
                                index === 2 ? "bg-orange-100 text-orange-700" :
                                    "bg-[var(--background)] text-muted"
                        }`}>
                        {index === 0 ? <Crown className="w-4 h-4" /> : index + 1}
                    </div>

                    {/* Customer Info */}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{customer.name}</p>
                        <p className="text-xs text-muted">{customer.totalOrders} orders</p>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                        <p className="font-bold text-foreground">{formatIQD(customer.totalSpent)}</p>
                    </div>

                    {/* Quick Action */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(generateWhatsAppLink(customer.phone, t("common.helloName", { name: customer.name })), "_blank");
                        }}
                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center transition-opacity"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </button>
                </motion.div>
            ))}
        </div>
    );
}
