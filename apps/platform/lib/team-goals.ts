// Team Goals Management Utilities
// Provides helper functions for goal calculations and persistence

export interface Goal {
    id: string;
    employeeId: string;
    employeeName: string;
    type: "daily" | "weekly" | "monthly";
    metric: "totalActions" | "ordersCreated" | "statusChanges" | "ordersPrinted";
    target: number;
    createdAt: string;
}

export interface GoalProgress {
    goal: Goal;
    currentValue: number;
    progress: number; // 0-100
    isAchieved: boolean;
    remaining: number;
}

const STORAGE_KEY = "team-goals";

// Load goals from localStorage
export function loadGoals(): Goal[] {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

// Save goals to localStorage
export function saveGoals(goals: Goal[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

// Add a new goal
export function addGoal(goal: Omit<Goal, "id" | "createdAt">): Goal {
    const goals = loadGoals();
    const newGoal: Goal = {
        ...goal,
        id: `goal-${Date.now()}`,
        createdAt: new Date().toISOString(),
    };
    saveGoals([...goals, newGoal]);
    return newGoal;
}

// Delete a goal
export function deleteGoal(id: string): void {
    const goals = loadGoals();
    saveGoals(goals.filter((g) => g.id !== id));
}

// Update a goal
export function updateGoal(id: string, updates: Partial<Goal>): void {
    const goals = loadGoals();
    saveGoals(goals.map((g) => (g.id === id ? { ...g, ...updates } : g)));
}

// Calculate goal progress
export function calculateProgress(
    goal: Goal,
    employeeMetrics: Record<string, number>
): GoalProgress {
    const currentValue = employeeMetrics[goal.metric] || 0;
    const progress = Math.min((currentValue / goal.target) * 100, 100);

    return {
        goal,
        currentValue,
        progress,
        isAchieved: currentValue >= goal.target,
        remaining: Math.max(goal.target - currentValue, 0),
    };
}

// Get goals for a specific employee
export function getEmployeeGoals(employeeId: string): Goal[] {
    return loadGoals().filter((g) => g.employeeId === employeeId);
}

// Get all goals with progress for a set of employees
export function getAllGoalsWithProgress(
    employees: Array<{
        userId: string;
        totalActions: number;
        ordersCreated: number;
        statusChanges: number;
        ordersPrinted: number;
    }>
): GoalProgress[] {
    const goals = loadGoals();
    const employeeMap = new Map(employees.map((e) => [e.userId, e]));

    return goals.map((goal) => {
        const employee = employeeMap.get(goal.employeeId);
        if (!employee) {
            return {
                goal,
                currentValue: 0,
                progress: 0,
                isAchieved: false,
                remaining: goal.target,
            };
        }
        return calculateProgress(goal, {
            totalActions: employee.totalActions,
            ordersCreated: employee.ordersCreated,
            statusChanges: employee.statusChanges,
            ordersPrinted: employee.ordersPrinted,
        });
    });
}

// Check if a goal should be active based on its type
export function isGoalActive(goal: Goal): boolean {
    const createdAt = new Date(goal.createdAt);
    const now = new Date();

    switch (goal.type) {
        case "daily":
            return createdAt.toDateString() === now.toDateString();
        case "weekly":
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return createdAt >= weekAgo;
        case "monthly":
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return createdAt >= monthAgo;
        default:
            return true;
    }
}

// Get summary statistics for goals
export function getGoalsSummary(goalsWithProgress: GoalProgress[]): {
    total: number;
    achieved: number;
    inProgress: number;
    achievementRate: number;
} {
    const achieved = goalsWithProgress.filter((g) => g.isAchieved).length;
    const total = goalsWithProgress.length;

    return {
        total,
        achieved,
        inProgress: total - achieved,
        achievementRate: total > 0 ? (achieved / total) * 100 : 0,
    };
}
