"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Clock, Truck, ArrowRight } from "lucide-react";
import { UrgencyMetrics } from "@/lib/analytics/dashboard-calculations";

interface UrgencyTriadProps {
    metrics: UrgencyMetrics;
    onAction: (type: 'failed' | 'unconfirmed' | 'returns') => void;
}

export function UrgencyTriad({ metrics, onAction }: UrgencyTriadProps) {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
            {/* Can 1: Failed Deliveries */}
            <motion.div variants={item} className="pastel-card p-4 border border-rose-100 bg-gradient-to-br from-white to-rose-50/50 hover:shadow-md transition-all cursor-pointer group" onClick={() => onAction('failed')}>
                <div className="flex items-start justify-between">
                    <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                        <Truck className="w-5 h-5" />
                    </div>
                    {metrics.failedDeliveries > 0 && (
                        <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-100 px-2 py-1 rounded-full animate-pulse-soft">
                            Urgent
                        </span>
                    )}
                </div>
                <div className="mt-3">
                    <h3 className="text-2xl font-bold text-rose-950">{metrics.failedDeliveries}</h3>
                    <p className="text-sm text-rose-700/80 font-medium">Failed Deliveries (7d)</p>
                </div>
                <div className="mt-3 text-xs text-rose-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Review rejected orders <ArrowRight className="w-3 h-3" />
                </div>
            </motion.div>

            {/* Card 2: Unconfirmed High Value */}
            <motion.div variants={item} className="pastel-card p-4 border border-amber-100 bg-gradient-to-br from-white to-amber-50/50 hover:shadow-md transition-all cursor-pointer group" onClick={() => onAction('unconfirmed')}>
                <div className="flex items-start justify-between">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                        <Clock className="w-5 h-5" />
                    </div>
                    {metrics.unconfirmedHighValue > 0 && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                            Action Needed
                        </span>
                    )}
                </div>
                <div className="mt-3">
                    <h3 className="text-2xl font-bold text-amber-950">{metrics.unconfirmedHighValue}</h3>
                    <p className="text-sm text-amber-700/80 font-medium">Stalled High-Value Orders</p>
                </div>
                <div className="mt-3 text-xs text-amber-500 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Process old new orders <ArrowRight className="w-3 h-3" />
                </div>
            </motion.div>

            {/* Card 3: High Return Cities */}
            <motion.div variants={item} className="pastel-card p-4 border border-purple-100 bg-gradient-to-br from-white to-purple-50/50 hover:shadow-md transition-all cursor-pointer group" onClick={() => onAction('returns')}>
                <div className="flex items-start justify-between">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-purple-400">Analysis</span>
                </div>
                <div className="mt-3">
                    <div className="flex items-baseline gap-1">
                        <h3 className="text-2xl font-bold text-purple-950">{metrics.highReturnCities[0]?.city || 'None'}</h3>
                    </div>
                    <p className="text-sm text-purple-700/80 font-medium">Highest Return Rate ({metrics.highReturnCities[0]?.rate.toFixed(0)}%)</p>
                </div>
                <div className="mt-3 text-xs text-purple-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    View city performance <ArrowRight className="w-3 h-3" />
                </div>
            </motion.div>
        </motion.div>
    );
}
