"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GitCompare,
    X,
    Users,
    Activity,
    Package,
    RefreshCw,
    Printer,
    ArrowUpRight,
    ArrowDownRight,
    Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedAvatarRing } from "./animated-avatar-ring";
import { PastelCard, pastelColors, PastelColor } from "./shared-pastel-components";

// Types
interface EmployeeData {
    userId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    isOnline: boolean;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
    ordersEdited: number;
    logins: number;
}

interface EmployeeComparisonProps {
    employees: EmployeeData[];
    onClose?: () => void;
    className?: string;
}

// Comparison stat row
function ComparisonRow({
    icon: Icon,
    label,
    value1,
    value2,
    color,
    pastelColor,
}: {
    icon: React.ElementType;
    label: string;
    value1: number;
    value2: number;
    color: string;
    pastelColor: PastelColor;
}) {
    const diff = value1 - value2;
    const percentDiff = value2 > 0 ? ((diff / value2) * 100).toFixed(0) : diff > 0 ? "+∞" : "0";
    const colorConfig = pastelColors[pastelColor];

    return (
        <div className="flex items-center gap-4 py-4 border-b border-[#F5F0E8] dark:border-white/5 last:border-0 hover:bg-[#FAF8F5] dark:hover:bg-white/5 px-4 -mx-4 transition-colors">
            {/* Employee 1 value */}
            <div className="w-24 text-left">
                <span className={cn(
                    "text-xl font-bold transition-colors",
                    value1 > value2 ? "text-[#1E1E1E] dark:text-white" : "text-[#9A9A9A] dark:text-gray-500"
                )}>
                    {value1}
                </span>
            </div>

            {/* Center with icon and label */}
            <div className="flex-1 flex flex-col items-center">
                <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center mb-1 transition-transform hover:scale-110",
                    colorConfig.bg
                )}>
                    <Icon className={cn("w-6 h-6", colorConfig.text)} />
                </div>
                <span className="text-xs font-medium text-[#6B6B6B] dark:text-gray-400 text-center mt-1">{label}</span>
            </div>

            {/* Employee 2 value */}
            <div className="w-24 text-right">
                <span className={cn(
                    "text-xl font-bold transition-colors",
                    value2 > value1 ? "text-[#1E1E1E] dark:text-white" : "text-[#9A9A9A] dark:text-gray-500"
                )}>
                    {value2}
                </span>
            </div>

            {/* Diff Indicator - Absolute positioned or floating */}
            <div className={cn(
                "absolute left-1/2 -translate-x-1/2 -translate-y-[28px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none",
                "px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm",
                diff > 0 ? "bg-[#E8F8E0] text-green-700" : diff < 0 ? "bg-[#FCEEF1] text-rose-700" : "bg-gray-100 text-gray-500"
            )}>
                {diff > 0 ? "+" : ""}{diff}
            </div>
        </div>
    );
}

// Employee selector
function EmployeeSelector({
    employees,
    selectedId,
    onSelect,
    position,
}: {
    employees: EmployeeData[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    position: "left" | "right";
}) {
    const selected = employees.find((e) => e.userId === selectedId);

    return (
        <div className={cn("flex-1", position === "left" ? "pl-0 lg:pl-8" : "pr-0 lg:pr-8")}>
            <div className="relative">
                <select
                    value={selectedId || ""}
                    onChange={(e) => onSelect(e.target.value)}
                    className={cn(
                        "w-full px-4 py-3 rounded-2xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10",
                        "text-sm font-bold text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none",
                        "appearance-none cursor-pointer shadow-sm hover:border-[#D6D3D1] dark:hover:border-white/20 transition-all"
                    )}
                >
                    <option value="">اختر موظف...</option>
                    {employees.map((emp) => (
                        <option key={emp.userId} value={emp.userId}>
                            {emp.displayName || emp.email.split("@")[0]}
                        </option>
                    ))}
                </select>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ArrowDownRight className="w-4 h-4 text-[#9A9A9A] dark:text-gray-500 rotate-45" />
                </div>
            </div>

            {selected && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 flex flex-col items-center"
                >
                    <div className="relative">
                        <div className="w-24 h-24 rounded-3xl overflow-hidden bg-gradient-to-br from-[#E4C1F9] to-[#F5E8FC] p-1 shadow-lg">
                            <div className="w-full h-full rounded-[20px] overflow-hidden bg-white">
                                {selected.avatarUrl ? (
                                    <img src={selected.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-[#1E1E1E] dark:text-white">
                                        {(selected.displayName || selected.email)?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                        </div>
                        {selected.isOnline && (
                            <span className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-green-500 border-4 border-white" />
                        )}
                    </div>

                    <h3 className="mt-4 text-xl font-bold text-[#1E1E1E] dark:text-white text-center">
                        {selected.displayName || selected.email.split("@")[0]}
                    </h3>
                    <p className="text-sm text-[#9A9A9A] dark:text-gray-500">{selected.email}</p>
                </motion.div>
            )}
        </div>
    );
}

export function EmployeeComparison({
    employees,
    onClose,
    className,
}: EmployeeComparisonProps) {
    const [employee1Id, setEmployee1Id] = useState<string | null>(
        employees[0]?.userId || null
    );
    const [employee2Id, setEmployee2Id] = useState<string | null>(
        employees[1]?.userId || null
    );

    const employee1 = useMemo(
        () => employees.find((e) => e.userId === employee1Id),
        [employees, employee1Id]
    );
    const employee2 = useMemo(
        () => employees.find((e) => e.userId === employee2Id),
        [employees, employee2Id]
    );

    const canCompare = employee1 && employee2 && employee1Id !== employee2Id;

    const comparisonMetrics: { key: string; icon: any; label: string; color: string; pastelColor: PastelColor }[] = [
        { icon: Activity, label: "إجمالي النشاطات", key: "totalActions", color: "#F59E0B", pastelColor: "yellow" },
        { icon: Package, label: "طلبات جديدة", key: "ordersCreated", color: "#10B981", pastelColor: "green" },
        { icon: RefreshCw, label: "تغييرات الحالة", key: "statusChanges", color: "#6366F1", pastelColor: "mint" },
        { icon: Printer, label: "طباعة", key: "ordersPrinted", color: "#8B5CF6", pastelColor: "purple" },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("relative", className)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#E4C1F9] dark:bg-purple-500/20 flex items-center justify-center">
                        <GitCompare className="w-6 h-6 text-purple-700 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-[#1E1E1E] dark:text-white">مقارنة الموظفين</h2>
                        <p className="text-[#6B6B6B] dark:text-gray-400">قارن الأداء وجهاً لوجه</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl hover:bg-white dark:hover:bg-white/10 hover:shadow-md transition-all text-[#9A9A9A] dark:text-gray-500 hover:text-[#1E1E1E] dark:hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                )}
            </div>

            {/* Employee Selectors */}
            <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                <EmployeeSelector
                    employees={employees.filter((e) => e.userId !== employee2Id)}
                    selectedId={employee1Id}
                    onSelect={setEmployee1Id}
                    position="left"
                />

                <div className="flex items-center justify-center py-4 md:py-0">
                    <div className="w-14 h-14 rounded-full bg-white dark:bg-[#1A1A1A] flex items-center justify-center shadow-md border-4 border-[#F5F0E8] dark:border-[#121212] z-10">
                        <span className="text-lg font-black text-[#1E1E1E] dark:text-white italic">VS</span>
                    </div>
                </div>

                <EmployeeSelector
                    employees={employees.filter((e) => e.userId !== employee1Id)}
                    selectedId={employee2Id}
                    onSelect={setEmployee2Id}
                    position="right"
                />
            </div>

            {/* Comparison Results */}
            <AnimatePresence mode="wait">
                {canCompare ? (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <PastelCard className="p-4 md:p-6 mb-6">
                            <div className="group">
                                {comparisonMetrics.map((metric) => (
                                    <ComparisonRow
                                        key={metric.key}
                                        icon={metric.icon}
                                        label={metric.label}
                                        value1={employee1[metric.key as keyof EmployeeData] as number}
                                        value2={employee2[metric.key as keyof EmployeeData] as number}
                                        color={metric.color}
                                        pastelColor={metric.pastelColor}
                                    />
                                ))}
                            </div>
                        </PastelCard>

                        {/* Winner banner */}
                        {employee1.totalActions !== employee2.totalActions && (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FBE38E] to-[#FDF5D4] p-6 text-center shadow-lg"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-20">
                                    <Trophy className="w-24 h-24 text-amber-900 rotate-12" />
                                </div>

                                <div className="relative z-10">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-md mb-3">
                                        <Trophy className="w-6 h-6 text-amber-600" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-amber-900 mb-1">
                                        {employee1.totalActions > employee2.totalActions
                                            ? employee1.displayName || employee1.email.split("@")[0]
                                            : employee2.displayName || employee2.email.split("@")[0]}
                                    </h3>
                                    <p className="font-medium text-amber-800">
                                        هو الأكثر نشاطاً بفارق <span className="font-extrabold">{Math.abs(employee1.totalActions - employee2.totalActions)}</span> عملية
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-white dark:bg-[#1A1A1A] border-dashed border-2 border-[#E8E4DC] dark:border-white/10 flex items-center justify-center">
                            <Users className="w-8 h-8 text-[#9A9A9A] dark:text-gray-600" />
                        </div>
                        <p className="text-[#6B6B6B] dark:text-gray-400 font-medium">اختر موظفين للمقارنة وبدء التحدي</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
