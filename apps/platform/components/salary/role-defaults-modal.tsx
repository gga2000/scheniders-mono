"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings2 } from "lucide-react";
import type { RoleSalaryDefault } from "@/types/salary";

interface RoleDefaultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    roleDefaults: RoleSalaryDefault[];
    onSave: (role: string, config: { base_monthly_salary: number; per_order_bonus: number }) => Promise<void>;
}

const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    employee: "Employee",
    viewer: "Viewer",
};

export function RoleDefaultsModal({ isOpen, onClose, roleDefaults, onSave }: RoleDefaultsModalProps) {
    const [values, setValues] = useState<Record<string, { base: number; bonus: number }>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const init: Record<string, { base: number; bonus: number }> = {};
            for (const rd of roleDefaults) {
                init[rd.role] = {
                    base: rd.base_monthly_salary,
                    bonus: rd.per_order_bonus,
                };
            }
            setValues(init);
        }
    }, [isOpen, roleDefaults]);

    const handleSave = async () => {
        setLoading(true);
        try {
            for (const [role, vals] of Object.entries(values)) {
                await onSave(role, {
                    base_monthly_salary: vals.base,
                    per_order_bonus: vals.bonus,
                });
            }
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-lg bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <Settings2 className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Role Salary Defaults</h2>
                                <p className="text-xs text-muted">Applied to employees using role defaults</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors">
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        {roleDefaults.map(rd => {
                            const val = values[rd.role] ?? { base: 0, bonus: 0 };
                            return (
                                <div
                                    key={rd.role}
                                    className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-3"
                                >
                                    <p className="text-sm font-semibold text-foreground">
                                        {ROLE_LABELS[rd.role] ?? rd.role}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-muted mb-1">Base Monthly (IQD)</label>
                                            <input
                                                type="number"
                                                value={val.base || ""}
                                                onChange={e =>
                                                    setValues(prev => ({
                                                        ...prev,
                                                        [rd.role]: { ...val, base: parseFloat(e.target.value) || 0 },
                                                    }))
                                                }
                                                min={0}
                                                placeholder="0"
                                                className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-muted mb-1">Per Order Bonus (IQD)</label>
                                            <input
                                                type="number"
                                                value={val.bonus || ""}
                                                onChange={e =>
                                                    setValues(prev => ({
                                                        ...prev,
                                                        [rd.role]: { ...val, bonus: parseFloat(e.target.value) || 0 },
                                                    }))
                                                }
                                                min={0}
                                                placeholder="0"
                                                className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-1 px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Save Defaults"
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
