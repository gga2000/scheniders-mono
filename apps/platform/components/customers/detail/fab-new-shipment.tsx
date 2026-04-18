"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface FabNewShipmentProps {
    customerPhone: string;
}

export function FabNewShipment({ customerPhone }: FabNewShipmentProps) {
    const router = useRouter();

    return (
        <div className="fixed bottom-10 right-10 z-40 group">
            {/* Tooltip */}
            <div className="absolute right-full mr-6 top-1/2 -translate-y-1/2 pointer-events-none">
                <span className="whitespace-nowrap bg-foreground text-background text-xs font-bold px-3.5 py-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    New Shipment
                </span>
            </div>

            {/* FAB button */}
            <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 20 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push(`/orders?newOrder=true&phone=${customerPhone}`)}
                className="bg-foreground text-background w-16 h-16 rounded-full shadow-2xl flex items-center justify-center hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)] transition-shadow"
                aria-label="New Shipment"
            >
                <Plus className="w-7 h-7" />
            </motion.button>
        </div>
    );
}
