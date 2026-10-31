"use client";

import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "@/lib/supabase";
import { PastelCard, PastelButton } from "./shared-pastel-components";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import { cn } from "@/lib/utils";

// Types
export interface Goal {
    id: string;
    employeeId: string;
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

const goalRowsSchema = z.array(
    z.object({
        id: z.string(),
        employee_id: z.string(),
        type: z.enum(["daily", "weekly", "monthly"]),
        metric: z.enum(["totalActions", "ordersCreated", "statusChanges", "ordersPrinted"]),
        target: z.coerce.number(),
        created_at: z.string(),
    }),
);

const METRIC_LABEL_KEYS: Record<Goal["metric"], string> = {
    totalActions: "team.goals.totalActions",
    ordersCreated: "team.goals.ordersCreated",
    statusChanges: "team.goals.statusChanges",
    ordersPrinted: "team.goals.ordersPrinted",
};

const TYPE_LABEL_KEYS: Record<Goal["type"], string> = {
    daily: "team.goals.daily",
    weekly: "team.goals.weekly",
    monthly: "team.goals.monthly",
};

// Goals live in the team_goals table (per store, RLS-protected), not in the browser.
export function useGoals() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const queryKey = ["team-goals", tenantId] as const;

    const { data: goals = [], isError: goalsFailed } = useQuery({
        queryKey,
        enabled: !!tenantId,
        queryFn: async (): Promise<Goal[]> => {
            const { data, error } = await supabase
                .from("team_goals")
                .select("id, employee_id, type, metric, target, created_at")
                .eq("tenant_id", tenantId ?? "")
                .order("created_at", { ascending: true });
            if (error) throw error;
            return goalRowsSchema.parse(data).map((r) => ({
                id: r.id,
                employeeId: r.employee_id,
                type: r.type,
                metric: r.metric,
                target: r.target,
                createdAt: r.created_at,
            }));
        },
    });

    const addMutation = useMutation({
        mutationFn: async (goal: Omit<Goal, "id" | "createdAt">) => {
            if (!tenantId) throw new Error("No active store");
            const { error } = await supabase.from("team_goals").insert({
                tenant_id: tenantId,
                employee_id: goal.employeeId,
                type: goal.type,
                metric: goal.metric,
                target: Math.round(goal.target),
            });
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
        onError: (e: Error) => toast({ title: t("team.goals.saveFailed"), description: e.message, variant: "error" }),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("team_goals").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
        onError: (e: Error) => toast({ title: t("team.goals.deleteFailed"), description: e.message, variant: "error" }),
    });

    return {
        goals,
        goalsFailed,
        addGoal: (goal: Omit<Goal, "id" | "createdAt">) => addMutation.mutateAsync(goal).catch(() => undefined),
        deleteGoal: (id: string) => deleteMutation.mutateAsync(id).catch(() => undefined),
    };
}

// Goal Card
function GoalCard({
    goal,
    employeeName,
    currentValue,
    onDelete,
}: {
    goal: Goal;
    employeeName: string;
    currentValue: number;
    onDelete: () => void;
}) {
    const { t } = useLanguage();
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
                            {t("team.goals.delete")}
                        </button>
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#6B6B6B] dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                            {t("team.goals.cancel")}
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
                        <p className="font-bold text-[#1E1E1E] dark:text-white truncate text-lg">{employeeName}</p>
                        <div className="flex items-center gap-2 text-xs font-medium text-[#6B6B6B] dark:text-gray-400 mt-0.5">
                            <span className="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-lg">{t(METRIC_LABEL_KEYS[goal.metric])}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {t(TYPE_LABEL_KEYS[goal.type])}
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
    onAdd: (goal: Omit<Goal, "id" | "createdAt">) => void | Promise<void>;
    onCancel: () => void;
}) {
    const { t } = useLanguage();
    const [employeeId, setEmployeeId] = useState("");
    const [type, setType] = useState<Goal["type"]>("daily");
    const [metric, setMetric] = useState<Goal["metric"]>("totalActions");
    const [target, setTarget] = useState(10);

    const handleSubmit = () => {
        const employee = employees.find((e) => e.userId === employeeId);
        if (!employee) return;

        onAdd({
            employeeId,
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
                    <h3 className="font-bold">{t("team.goals.newGoal")}</h3>
                </div>

                <div className="space-y-4">
                    {/* Employee selector */}
                    <div>
                        <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                            {t("team.goals.employee")}
                        </label>
                        <div className="relative">
                            <select
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="">{t("team.goals.selectEmployee")}</option>
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
                                {t("team.goals.frequency")}
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as Goal["type"])}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="daily">{t("team.goals.daily")}</option>
                                <option value="weekly">{t("team.goals.weekly")}</option>
                                <option value="monthly">{t("team.goals.monthly")}</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                                {t("team.goals.actionType")}
                            </label>
                            <select
                                value={metric}
                                onChange={(e) => setMetric(e.target.value as Goal["metric"])}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-sm font-medium text-[#1E1E1E] dark:text-white focus:ring-2 focus:ring-[#FBE38E] dark:focus:ring-amber-500/50 outline-none appearance-none"
                            >
                                <option value="totalActions">{t("team.goals.totalActions")}</option>
                                <option value="ordersCreated">{t("team.goals.ordersCreated")}</option>
                                <option value="statusChanges">{t("team.goals.statusChanges")}</option>
                                <option value="ordersPrinted">{t("team.goals.ordersPrinted")}</option>
                            </select>
                        </div>
                    </div>

                    {/* Target */}
                    <div>
                        <label className="text-sm font-bold text-[#1E1E1E] dark:text-white mb-2 block">
                            {t("team.goals.targetValue")}
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
                                {t("team.goals.operation")}
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
                                {t("team.goals.saveGoal")}
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

// Map goal metric names to activity_logs action values
const METRIC_TO_ACTIONS: Record<Goal["metric"], string[]> = {
    totalActions: ["order.create", "order.status_change", "order.edit", "order.print"],
    ordersCreated: ["order.create"],
    statusChanges: ["order.status_change"],
    ordersPrinted: ["order.print"],
};

// Windows follow the store's Baghdad calendar day: daily = since today 00:00, weekly = last 7 days, monthly = last 30 days.
function getDateFilterForGoalType(type: Goal["type"]): string {
    const days = type === "daily" ? 0 : type === "weekly" ? 6 : 29;
    const start = baghdadDayStart(addDaysToDayKey(baghdadDayKey(), -days));
    return new Date(start).toISOString();
}

export function GoalTracking({ employees, className }: GoalTrackingProps) {
    const { t } = useLanguage();
    const { goals, goalsFailed, addGoal, deleteGoal } = useGoals();
    const [isAdding, setIsAdding] = useState(false);
    const employeeNames = useMemo(
        () => new Map(employees.map((e) => [e.userId, e.displayName || e.email.split("@")[0]])),
        [employees],
    );
    const [periodStats, setPeriodStats] = useState<Record<string, number>>({});

    // Fetch period-specific stats for each goal
    useEffect(() => {
        if (goals.length === 0) return;

        const fetchPeriodStats = async () => {
            const statsMap: Record<string, number> = {};

            // Group goals by employee + type to minimize queries
            const queryGroups = new Map<string, { employeeId: string; type: Goal["type"]; metrics: Goal["metric"][]; goalIds: string[] }>();
            for (const goal of goals) {
                const key = `${goal.employeeId}_${goal.type}`;
                if (!queryGroups.has(key)) {
                    queryGroups.set(key, { employeeId: goal.employeeId, type: goal.type, metrics: [], goalIds: [] });
                }
                const group = queryGroups.get(key)!;
                group.metrics.push(goal.metric);
                group.goalIds.push(goal.id);
            }

            await Promise.all(
                Array.from(queryGroups.values()).map(async (group) => {
                    const dateFilter = getDateFilterForGoalType(group.type);
                    const allActions = [...new Set(group.metrics.flatMap(m => METRIC_TO_ACTIONS[m]))];

                    const { data, error } = await supabase
                        .from("activity_logs")
                        .select("action")
                        .eq("user_id", group.employeeId)
                        .gte("created_at", dateFilter)
                        .in("action", allActions);

                    if (!error && data) {
                        // Count actions for each metric
                        for (const goal of goals.filter(g => g.employeeId === group.employeeId && g.type === group.type)) {
                            const targetActions = METRIC_TO_ACTIONS[goal.metric];
                            statsMap[goal.id] = data.filter(d => targetActions.includes(d.action)).length;
                        }
                    }
                })
            );

            setPeriodStats(statsMap);
        };

        fetchPeriodStats();
    }, [goals]);

    // Calculate current values for each goal using period-specific stats
    const goalsWithProgress = useMemo(() => {
        return goals.map((goal) => {
            const currentValue = periodStats[goal.id] ?? 0;
            return { goal, currentValue };
        });
    }, [goals, periodStats]);

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
                            <h2 className="text-2xl font-bold text-[#1E1E1E] dark:text-white">{t("team.goals.title", "Goal Tracking")}</h2>
                            {achievedCount > 0 && (
                                <span className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                    {achievedCount} {t("team.goals.achieved", "Goals Achieved!")}
                                </span>
                            )}
                        </div>
                        <p className="text-[#6B6B6B] dark:text-gray-400">{t("team.goals.subtitle", "Set goals for your team and track their progress")}</p>
                    </div>
                </div>

                {!isAdding && (
                    <PastelButton onClick={() => setIsAdding(true)} variant="yellow">
                        <span className="flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            {t("team.goals.newBtn", "New Goal")}
                        </span>
                    </PastelButton>
                )}
            </div>

            {/* Add form */}
            <AnimatePresence>
                {isAdding && (
                    <AddGoalForm
                        employees={employees}
                        onAdd={async (goal) => {
                            await addGoal(goal);
                            setIsAdding(false);
                        }}
                        onCancel={() => setIsAdding(false)}
                    />
                )}
            </AnimatePresence>

            {goalsFailed && (
                <p role="alert" className="text-sm font-medium text-rose-600">{t("team.goals.loadFailed")}</p>
            )}

            {/* Goals list */}
            {goalsWithProgress.length === 0 && !isAdding ? (
                <div className="text-center py-16">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#FAF8F5] dark:bg-white/5 flex items-center justify-center border-4 border-white dark:border-[#1A1A1A] shadow-sm">
                        <Target className="w-10 h-10 text-[#D6D3D1] dark:text-gray-600" />
                    </div>
                    <h3 className="text-xl font-bold text-[#1E1E1E] dark:text-white mb-2">{t("team.goals.emptyTitle", "No active goals")}</h3>
                    <p className="text-[#6B6B6B] dark:text-gray-400 max-w-xs mx-auto mb-8">{t("team.goals.emptySubtitle", "Start by setting daily or weekly goals to boost productivity")}</p>
                    <PastelButton onClick={() => setIsAdding(true)} active>
                        {t("team.goals.addFirst", "Add First Goal")}
                    </PastelButton>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {goalsWithProgress.map(({ goal, currentValue }) => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                employeeName={employeeNames.get(goal.employeeId) ?? t("team.goals.formerMember")}
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
