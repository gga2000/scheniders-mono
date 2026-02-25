"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Target,
    Plus,
    X,
    Check,
    Trash2,
    Trophy,
    Calendar,
    Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PastelCard, pastelColors, PastelButton } from "./shared-pastel-components";

// Types
export interface Goal {
    id: string;
    employeeId: string;
    employeeName: string;
    type: "daily" | "weekly" | "monthly";
    metric: "totalActions" | "ordersCreated" | "statusChanges" | "ordersPrinted";
    target: number;
    createdAt: string;
}

interface EmployeeData {
    userId: string;
    email: string;
    displayName: string | null;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
}

interface GoalTrackingProps {
    employees: EmployeeData[];
    className?: string;
}

const STORAGE_KEY = "team-goals";

const METRIC_LABELS: Record<Goal["metric"], string> = {
    totalActions: "إجمالي النشاطات",
    ordersCreated: "طلبات جديدة",
    statusChanges: "تغييرات الحالة",
    ordersPrinted: "طباعة",
};

const TYPE_LABELS: Record<Goal["type"], string> = {
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
};

// Custom hook for goal management
export function useGoals() {
    const [goals, setGoals] = useState<Goal[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setGoals(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse goals:", e);
            }
        }
    }, []);

    const saveToStorage = useCallback((newGoals: Goal[]) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newGoals));
        setGoals(newGoals);
    }, []);

    const addGoal = useCallback(
        (goal: Omit<Goal, "id" | "createdAt">) => {
            const newGoal: Goal = {
                ...goal,
                id: `goal-${Date.now()}`,
                createdAt: new Date().toISOString(),
            };
            saveToStorage([...goals, newGoal]);
            return newGoal;
        },
        [goals, saveToStorage]
    );

    const updateGoal = useCallback(
        (id: string, updates: Partial<Goal>) => {
            saveToStorage(goals.map((g) => (g.id === id ? { ...g, ...updates } : g)));
        },
        [goals, saveToStorage]
    );

    const deleteGoal = useCallback(
        (id: string) => {
            saveToStorage(goals.filter((g) => g.id !== id));
        },
        [goals, saveToStorage]
    );

    return { goals, addGoal, updateGoal, deleteGoal };
}

// Goal Card
function GoalCard({
    goal,
    currentValue,
    onDelete,
}: {
    goal: Goal;
    currentValue: number;
    onDelete: () => void;
}) {
    const [showConfirm, setShowConfirm] = useState(false);
    const progress = Math.min((currentValue / goal.target) * 100, 100);
    const isAchieved = currentValue >= goal.target;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            layout
        >
            <PastelCard
                className={cn(
                    "p-5",
                    isAchieved && "ring-2 ring-green-400"
                )}
                variant={isAchieved ? "green" : "white"}
            >
                {/* Delete button */}
                {showConfirm ? (
                    <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-xl p-1.5 shadow-lg">
                        <button
                            onClick={() => { onDelete(); setShowConfirm(false); }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors"
                        >
                            حذف
                        </button>
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#6B6B6B] dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                            إلغاء
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowConfirm(true)}
                        className="absolute top-3 left-3 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-[#9A9A9A] dark:text-gray-500 hover:text-rose-500 transition-colors z-20"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}

                {/* Achievement badge */}
                {isAchieved && (
                    <div className="absolute -top-3 -right-3 z-20">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring" }}
                            className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center shadow-lg border-2 border-white"
                        >
                            <Trophy className="w-5 h-5 text-white" />
                        </motion.div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-start gap-3 mb-4 pr-2">
                    <div
                        className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center",
                            isAchieved ? "bg-white/50" : "bg-[#FBE38E]"
                        )}
                    >
                        <Target className={cn("w-6 h-6", isAchieved ? "text-green-700" : "text-amber-700")} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#1E1E1E] dark:text-white truncate text-lg">{goal.employeeName}</p>
                        <div className="flex items-center gap-2 text-xs font-medium text-[#6B6B6B] dark:text-gray-400 mt-0.5">
                            <span className="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-lg">{METRIC_LABELS[goal.metric]}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {TYPE_LABELS[goal.type]}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress */}
                <div className="space-y-3 relative z-10">
                    <div className="flex items-end justify-between">
                        <div className="flex items-baseline gap-1">
                            <span className={cn("text-2xl font-bold", isAchieved ? "text-green-800 dark:text-green-400" : "text-[#1E1E1E] dark:text-white")}>
                                {currentValue}
                            </span>
                            <span className="text-sm text-[#6B6B6B] dark:text-gray-400 font-medium">/ {goal.target}</span>
                        </div>
                        <span className={cn("text-sm font-bold", isAchieved ? "text-green-700 dark:text-green-400" : "text-[#1E1E1E] dark:text-white")}>
                            {progress.toFixed(0)}%
                        </span>
                    </div>

                    <div className="h-3 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1, type: "spring" }}
                            className={cn(
                                "h-full rounded-full shadow-sm",
                                isAchieved
                                    ? "bg-gradient-to-r from-green-500 to-emerald-400"
                                    : "bg-gradient-to-r from-[#FBE38E] to-amber-300"
                            )}
                        />
                    </div>
                </div>
            </PastelCard>
        </motion.div>
    );
}

// Add Goal Form
function AddGoalForm({
    employees,
    onAdd,
    onCancel,
}: {
    employees: EmployeeData[];
    onAdd: (goal: Omit<Goal, "id" | "createdAt">) => void;
    onCancel: () => void;
}) {
    const [employeeId, setEmployeeId] = useState("");
    const [type, setType] = useState<Goal["type"]>("daily");
    const [metric, setMetric] = useState<Goal["metric"]>("totalActions");
    const [target, setTarget] = useState(10);

    const handleSubmit = () => {
        const employee = employees.find((e) => e.userId === employeeId);
        if (!employee) return;

        onAdd({
            employeeId,
            employeeName: employee.displayName || employee.email.split("@")[0],
            type,
            metric,
            target,
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
        >
            <PastelCard className="p-6 border-2 border-dashed border-[#E8E4DC] dark:border-white/10 shadow-none bg-[#FAF8F5] dark:!bg-white/5">
                <div className="flex items-center gap-2 mb-4 text-[#1E1E1E] dark:text-white">
                    <Flag className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold">تحديد هدف جديد</h3>
                </div>

                <div className="space-y-4">
                    {/* Employee selector */}
                    <div>
                        <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                            الموظف
                        </label>
                        <div className="relative">
                            <select
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="">اختر موظف...</option>
                                {employees.map((emp) => (
                                    <option key={emp.userId} value={emp.userId}>
                                        {emp.displayName || emp.email.split("@")[0]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Type and Metric */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                                التكرار
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as Goal["type"])}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="daily">يومي</option>
                                <option value="weekly">أسبوعي</option>
                                <option value="monthly">شهري</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                                نوع النشاط
                            </label>
                            <select
                                value={metric}
                                onChange={(e) => setMetric(e.target.value as Goal["metric"])}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="totalActions">إجمالي النشاطات</option>
                                <option value="ordersCreated">طلبات جديدة</option>
                                <option value="statusChanges">تغييرات الحالة</option>
                                <option value="ordersPrinted">طباعة</option>
                            </select>
                        </div>
                    </div>

                    {/* Target */}
                    <div>
                        <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                            القيمة المستهدفة
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={target}
                                onChange={(e) => setTarget(Number(e.target.value))}
                                min={1}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-bold text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none pl-12"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9A9A] text-xs font-bold">
                                عملية
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <PastelButton
                            onClick={handleSubmit}
                            disabled={!employeeId}
                            active
                            className="flex-1 flex justify-center py-3"
                        >
                            <span className="flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                حفظ الهدف
                            </span>
                        </PastelButton>
                        <PastelButton
                            onClick={onCancel}
                            className="px-6 py-3"
                        >
                            <X className="w-4 h-4" />
                        </PastelButton>
                    </div>
                </div>
            </PastelCard>
        </motion.div>
    );
}

export function GoalTracking({ employees, className }: GoalTrackingProps) {
    const { goals, addGoal, deleteGoal } = useGoals();
    const [isAdding, setIsAdding] = useState(false);

    // Calculate current values for each goal
    const goalsWithProgress = useMemo(() => {
        return goals.map((goal) => {
            const employee = employees.find((e) => e.userId === goal.employeeId);
            const currentValue = employee?.[goal.metric] || 0;
            return { goal, currentValue };
        });
    }, [goals, employees]);

    const achievedCount = goalsWithProgress.filter((g) => g.currentValue >= g.goal.target).length;

    return (
        <div className={cn("space-y-6", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#C0EBA6] dark:bg-green-500/20 flex items-center justify-center">
                        <Target className="w-6 h-6 text-green-700 dark:text-green-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-[#1E1E1E] dark:text-white">تتبع الأهداف</h2>
                            {achievedCount > 0 && (
                                <span className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                    {achievedCount} هدف محقق!
                                </span>
                            )}
                        </div>
                        <p className="text-[#6B6B6B] dark:text-gray-400">حدد أهداف للفريق وتابع تقدمهم</p>
                    </div>
                </div>

                {!isAdding && (
                    <PastelButton onClick={() => setIsAdding(true)} variant="yellow">
                        <span className="flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            هدف جديد
                        </span>
                    </PastelButton>
                )}
            </div>

            {/* Add form */}
            <AnimatePresence>
                {isAdding && (
                    <AddGoalForm
                        employees={employees}
                        onAdd={(goal) => {
                            addGoal(goal);
                            setIsAdding(false);
                        }}
                        onCancel={() => setIsAdding(false)}
                    />
                )}
            </AnimatePresence>

            {/* Goals list */}
            {goalsWithProgress.length === 0 && !isAdding ? (
                <div className="text-center py-16">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#FAF8F5] dark:bg-white/5 flex items-center justify-center border-4 border-white dark:border-[#1A1A1A] shadow-sm">
                        <Target className="w-10 h-10 text-[#D6D3D1] dark:text-gray-600" />
                    </div>
                    <h3 className="text-xl font-bold text-[#1E1E1E] dark:text-white mb-2">لا توجد أهداف حالياً</h3>
                    <p className="text-[#6B6B6B] dark:text-gray-400 max-w-xs mx-auto mb-8">ابدأ بتحديد أهداف يومية أو أسبوعية للموظفين لرفع الإنتاجية</p>
                    <PastelButton onClick={() => setIsAdding(true)} active>
                        إضافة أول هدف
                    </PastelButton>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {goalsWithProgress.map(({ goal, currentValue }) => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                currentValue={currentValue}
                                onDelete={() => deleteGoal(goal.id)}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
