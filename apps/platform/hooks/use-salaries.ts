"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type {
    EmployeePayrollData,
    PayrollCalculation,
    SalaryAdvance,
    SalaryPenalty,
    PerformanceBonus,
    EffectiveSalaryRate,
    OrderBreakdown,
    OrderStatusBreakdown,
    OrderBucket,
    CountedOrderDetail,
    ReturnedAfterPayment,
} from "@/types/salary";

/** A completed order row, with the fields needed to classify it. */
interface CompletedOrderRow {
    id: string;
    created_at: string;
    /** When the order entered `completed` status (set by the DB trigger). Drives payroll period bucketing. */
    completed_at: string | null;
    order_id: string;
    customer_name: string | null;
    status: string;
    is_replacement: boolean | null;
    is_return: boolean | null;
    price: number | null;
    sequence_number: number | null;
    refund_status: string | null;
    /** IQD paid back for items on this order's completed refunds (kept by the database). */
    refunded_amount: number | null;
}

/**
 * True when a completed order's *completion* falls within [periodStart, periodEnd] (inclusive days, UTC).
 *
 * Payroll buckets completed orders by `completed_at` — the date the order was MARKED completed —
 * not by `created_at` (when the order was placed). An order placed before a pay period but completed
 * inside it (e.g. the customer's money arrived late) belongs to the period in which it completed; the
 * employee is paid for it in that run. Bucketing by `created_at` would bury such an order in the
 * already-paid window it was placed in, so it would be paid by nobody. Orders with no `completed_at`
 * (historical imports that never transitioned through the trigger) are excluded.
 */
export function isCompletedInPeriod(
    completedAt: string | null,
    periodStart: string,
    periodEnd: string
): boolean {
    if (!completedAt) return false;
    return completedAt >= periodStart + "T00:00:00Z" && completedAt <= periodEnd + "T23:59:59Z";
}

/** A return/refund order row (any status) — for refund linkage + the returned-after-payment flag. */
interface ReturnOrderRow {
    id: string;
    created_at: string;
    order_id: string;
    customer_name: string | null;
    status: string;
    original_order_id: string | null;
}

/** Identifiers of completed orders that were later refunded (derived from return orders). */
interface RefundedOriginals {
    /** original_order_id values present on return orders. */
    ids: Set<string>;
    /** Original sequence numbers parsed from `RTN-{seq}-{n}` return codes. */
    seqs: Set<number>;
}

/**
 * Classify a completed order into a quality bucket.
 *
 * A completed order is treated as a refund when ANY of these hold:
 *  - it is itself a return order (`is_return`) or has a negative price;
 *  - it is the ORIGINAL of a refund — i.e. a return order links to it via
 *    `original_order_id`, or a `RTN-{thisSequence}-{n}` return code exists.
 *    (The original keeps `status='completed'`, so without this link a refunded
 *    delivery would be wrongly paid as genuine revenue.)
 */
function classifyOrder(o: CompletedOrderRow, refunded: RefundedOriginals): OrderBucket {
    // Partly refunded: still a sale, paid in proportion to what was kept
    // (keptShare). Checked before the link fallbacks, which would otherwise
    // see its refund order and drop it whole.
    if (o.refund_status === "partial") return "genuine";
    if (
        // Primary signal: the order's own refund dimension (pending or completed refund).
        o.refund_status === "refunded" ||
        o.refund_status === "pending" ||
        // Fallbacks (cover rows not yet carrying refund_status, or standalone returns):
        o.is_return ||
        (typeof o.price === "number" && o.price < 0) ||
        refunded.ids.has(o.id) ||
        (o.sequence_number != null && refunded.seqs.has(o.sequence_number))
    ) return "refund";
    // Replacement (re-ship, not a new sale). Fall back to the RPL- code in case the flag is unset.
    if (o.is_replacement || o.order_id?.startsWith("RPL-")) return "replacement";
    return "genuine";
}

/**
 * Share of a genuine order that still pays the per-order bonus: 1, or for a
 * partly refunded order the part of its price the customer kept (owner
 * decision 2026-10-27: commission on a partial refund is reduced in proportion).
 */
export function keptShare(o: Pick<CompletedOrderRow, "refund_status" | "refunded_amount" | "price">): number {
    if (o.refund_status !== "partial") return 1;
    const price = Number(o.price) || 0;
    if (price <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - (Number(o.refunded_amount) || 0) / price));
}

const EMPTY_BREAKDOWN: OrderBreakdown = {
    completedTotal: 0, genuine: 0, replacements: 0, refunds: 0, qualityScore: 0,
};

const EMPTY_STATUS_BREAKDOWN: OrderStatusBreakdown = {
    total: 0, completed: 0, inTransit: 0, cancelled: 0, rejected: 0, noResponse: 0, pending: 0, returns: 0,
};

/** A lightweight order row (any status) — used for the whole-pipeline status breakdown. */
interface StatusOrderRow {
    id: string;
    created_at: string;
    status: string;
}

/** Tally a list of orders into a whole-pipeline status breakdown. */
function buildStatusBreakdown(rows: { status: string }[]): OrderStatusBreakdown {
    const b: OrderStatusBreakdown = { ...EMPTY_STATUS_BREAKDOWN, total: rows.length };
    for (const r of rows) {
        switch (r.status) {
            case "completed": b.completed++; break;
            case "in_transit":
            case "delivered": b.inTransit++; break;
            case "cancelled": b.cancelled++; break;
            case "rejected": b.rejected++; break;
            case "no_response": b.noResponse++; break;
            case "return_pending":
            case "refund_delivered":
            case "refund_failed": b.returns++; break;
            // new / contacted / confirmed / pending_checkout / suspended
            default: b.pending++; break;
        }
    }
    return b;
}

interface UserProfileRow {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    avatar_url: string | null;
    is_active: boolean;
}

interface ActivityLogRow {
    user_id: string;
    action: string;
    entity_id: string | null;
    details: Record<string, string> | null;
    created_at: string;
}

/**
 * Fetch every row from a query, paging past Supabase's 1000-row default cap.
 * `build(from, to)` must return a query with the same filters plus a stable order.
 */
async function fetchAllRows<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
    const PAGE = 1000;
    const all: T[] = [];
    let from = 0;
    // Cap total pages defensively (50k rows) to avoid runaway loops.
    for (let page = 0; page < 50; page++) {
        const { data, error } = await build(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

/** Number of assumed working days per month (Mon–Sat) */
const WORKING_DAYS_PER_MONTH = 26;

/** Count Mon–Fri–Sat days in a date range (exclude Sunday only) */
function countWorkingDays(startDate: string, endDate: string): number {
    let count = 0;
    const current = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T23:59:59Z");
    while (current <= end) {
        if (current.getUTCDay() !== 0) count++;
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return count;
}

export type OrderAttributionMode = "all" | "last_touched";
export type PeriodMode = "since_last" | "custom";

/** Per-employee period override. If absent for an employee, the global period is used. */
export type EmployeePeriodOverrides = Map<string, { start: string; end: string }>;

export function useSalaries(
    globalPeriodStart: string,
    globalPeriodEnd: string,
    attributionMode: OrderAttributionMode = "all",
    periodOverrides: EmployeePeriodOverrides = new Map(),
    periodMode: PeriodMode = "custom"
) {
    const { tenantId } = useAuth();
    const [employees, setEmployees] = useState<UserProfileRow[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
    const [completedOrders, setCompletedOrders] = useState<CompletedOrderRow[]>([]);
    const [allOrders, setAllOrders] = useState<StatusOrderRow[]>([]);
    const [returnOrders, setReturnOrders] = useState<ReturnOrderRow[]>([]);
    const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
    const [penalties, setPenalties] = useState<SalaryPenalty[]>([]);
    const [bonuses, setBonuses] = useState<PerformanceBonus[]>([]);
    const [salaryConfigs, setSalaryConfigs] = useState<
        { employee_id: string; base_monthly_salary: number; per_order_bonus: number; use_role_defaults: boolean }[]
    >([]);
    const [roleDefaults, setRoleDefaults] = useState<
        { role: string; base_monthly_salary: number; per_order_bonus: number }[]
    >([]);
    const [lastPayrollDates, setLastPayrollDates] = useState<Map<string, string>>(new Map());
    // All paid records overlapping the fetch window — used for duplicate guard
    const [paidRecordsInWindow, setPaidRecordsInWindow] = useState<
        { id: string; employee_id: string; period_start: string; period_end: string; net_salary: number; paid_at: string }[]
    >([]);
    const [isLoading, setIsLoading] = useState(true);

    // Compute the widest date window across global + all overrides so one fetch covers everything
    const { fetchStart, fetchEnd } = useMemo(() => {
        let start = globalPeriodStart;
        let end = globalPeriodEnd;
        for (const ov of periodOverrides.values()) {
            if (ov.start < start) start = ov.start;
            if (ov.end > end) end = ov.end;
        }
        return { fetchStart: start, fetchEnd: end };
    }, [globalPeriodStart, globalPeriodEnd, periodOverrides]);

    const fetchData = useCallback(async () => {
        // Payroll counts this tenant's orders only; RLS alone would add every
        // other tenant the viewer belongs to.
        if (!fetchStart || !fetchEnd || !tenantId) return;
        await Promise.resolve();
        setIsLoading(true);

        // ── Phase 1: profiles, configs, deductions, and payroll history ──
        // We need the payroll history first to learn each employee's "since last"
        // start, which may predate the 90-day default fetch window.
        const [
            empRes, configRes, roleRes, advRes, penRes, bonRes, payrollRes,
        ] = await Promise.all([
            supabase
                .from("user_profiles")
                .select("id, email, display_name, role, avatar_url, is_active")
                .eq("is_active", true),

            supabase.from("employee_salary_configs")
                .select("employee_id, base_monthly_salary, per_order_bonus, use_role_defaults"),

            supabase.from("role_salary_defaults")
                .select("role, base_monthly_salary, per_order_bonus"),

            supabase.from("salary_advances").select("*").eq("is_deducted", false),
            supabase.from("salary_penalties").select("*").eq("is_applied", false),
            supabase.from("performance_bonuses").select("*").eq("is_applied", false),

            supabase
                .from("payroll_records")
                .select("employee_id, period_end")
                .eq("status", "paid")
                .order("period_end", { ascending: false }),
        ]);

        const map = new Map<string, string>();
        if (payrollRes.data) {
            for (const row of payrollRes.data) {
                if (!map.has(row.employee_id)) map.set(row.employee_id, row.period_end);
            }
        }

        // In "since last" mode, extend the window back to cover the earliest
        // per-employee period so order/activity counts aren't silently truncated.
        // This is what makes "Since Last Payroll" and an equivalent Custom range agree.
        let windowStart = fetchStart;
        if (periodMode === "since_last") {
            for (const periodEnd of map.values()) {
                if (periodEnd < windowStart) windowStart = periodEnd;
            }
        }

        // ── Phase 2: time-windowed data (activity, orders, returns, overlap guard) ──
        // Orders and activity logs are paginated past Supabase's 1000-row cap —
        // without this, a wide window (e.g. "Since Last Payroll") silently truncates
        // the order set and undercounts every employee.
        const wStart = windowStart + "T00:00:00Z";
        const wEnd = fetchEnd + "T23:59:59Z";
        const [logsData, paidInWindowRes, completedOrdersData, returnsData, allOrdersData] = await Promise.all([
            // Wide window — we'll slice per-employee client-side
            fetchAllRows<ActivityLogRow>((from, to) =>
                supabase
                    .from("activity_logs")
                    .select("user_id, action, entity_id, details, created_at")
                    .gte("created_at", wStart)
                    .lte("created_at", wEnd)
                    .order("created_at", { ascending: true })
                    .range(from, to)
            ),

            // For duplicate guard: all paid records that overlap the fetch window
            supabase
                .from("payroll_records")
                .select("id, employee_id, period_start, period_end, net_salary, paid_at")
                .eq("status", "paid")
                .lte("period_start", fetchEnd)
                .gte("period_end", windowStart),

            // Completed orders — filter by completed_at (when the order was MARKED completed),
            // NOT created_at. An order placed before the window but completed inside it (late-arriving
            // money) belongs to the period it completed in; created_at bucketing would lose it.
            // Pull the flags + sequence so we can split genuine deliveries from replacements/refunds.
            fetchAllRows<CompletedOrderRow>((from, to) =>
                supabase
                    .from("orders")
                    .select("id, created_at, completed_at, order_id, customer_name, status, is_replacement, is_return, price, sequence_number, refund_status, refunded_amount")
                    .eq("tenant_id", tenantId)
                    .eq("status", "completed")
                    .gte("completed_at", wStart)
                    .lte("completed_at", wEnd)
                    .order("completed_at", { ascending: true })
                    .range(from, to)
            ),

            // ALL return/refund orders (any status, any date) — used to detect which
            // completed originals were refunded, and for the returned-after-payment flag.
            // A refund can be created long after the original delivery, so we don't
            // window this; the set is small.
            fetchAllRows<ReturnOrderRow>((from, to) =>
                supabase
                    .from("orders")
                    .select("id, created_at, order_id, customer_name, status, original_order_id")
                    .eq("tenant_id", tenantId)
                    .eq("is_return", true)
                    .order("created_at", { ascending: true })
                    .range(from, to)
            ),

            // ALL orders (any status) created in the window — lightweight (id/date/status only).
            // Drives the whole-pipeline status breakdown shown on the payslip (came in,
            // cancelled, no-response, rejected, in-transit, …), not just completed deliveries.
            fetchAllRows<StatusOrderRow>((from, to) =>
                supabase
                    .from("orders")
                    .select("id, created_at, status")
                    .eq("tenant_id", tenantId)
                    .gte("created_at", wStart)
                    .lte("created_at", wEnd)
                    .order("created_at", { ascending: true })
                    .range(from, to)
            ),
        ]);

        if (empRes.data) setEmployees(empRes.data);
        if (configRes.data) setSalaryConfigs(configRes.data);
        if (roleRes.data) setRoleDefaults(roleRes.data);
        setActivityLogs(logsData);
        if (advRes.data) setAdvances(advRes.data);
        if (penRes.data) setPenalties(penRes.data);
        if (bonRes.data) setBonuses(bonRes.data);
        setCompletedOrders(completedOrdersData);
        setAllOrders(allOrdersData);
        setReturnOrders(returnsData);

        setLastPayrollDates(map);
        if (paidInWindowRes.data) setPaidRecordsInWindow(paidInWindowRes.data as typeof paidRecordsInWindow);
        setIsLoading(false);
    }, [fetchStart, fetchEnd, periodMode, tenantId]);

    // fetchData() awaits Promise.resolve() before any setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    const getEffectiveRate = useCallback(
        (employeeId: string, role: string): EffectiveSalaryRate => {
            const empConfig = salaryConfigs.find(c => c.employee_id === employeeId);
            if (empConfig && !empConfig.use_role_defaults) {
                return {
                    baseMonthlySalary: empConfig.base_monthly_salary,
                    perOrderBonus: empConfig.per_order_bonus,
                    source: "employee_config",
                };
            }
            const roleDef = roleDefaults.find(r => r.role === role);
            if (roleDef) {
                return {
                    baseMonthlySalary: roleDef.base_monthly_salary,
                    perOrderBonus: roleDef.per_order_bonus,
                    source: "role_default",
                };
            }
            return { baseMonthlySalary: 0, perOrderBonus: 0, source: "none" };
        },
        [salaryConfigs, roleDefaults]
    );

    // Set of completed originals that were later refunded, derived from return orders.
    // Link by original_order_id (when set) and by the `RTN-{originalSequence}-{n}` code.
    const refundedOriginals = useMemo((): RefundedOriginals => {
        const ids = new Set<string>();
        const seqs = new Set<number>();
        for (const r of returnOrders) {
            // A failed/rejected refund means the money was NOT returned, so the
            // original stays genuine revenue — don't exclude it.
            if (r.status === "refund_failed" || r.status === "rejected") continue;
            if (r.original_order_id) ids.add(r.original_order_id);
            if (r.order_id?.startsWith("RTN-")) {
                const seq = Number.parseInt(r.order_id.split("-")[1], 10);
                if (!Number.isNaN(seq)) seqs.add(seq);
            }
        }
        return { ids, seqs };
    }, [returnOrders]);

    const employeePayrollData = useMemo((): EmployeePayrollData[] => {
        if (!globalPeriodStart || !globalPeriodEnd) return [];

        // Build full last-touched map from ALL logs in the fetch window
        const orderLastTouchedBy = new Map<string, string>();
        const sortedLogs = [...activityLogs]
            .filter(l => l.action === "order.status_change" && l.entity_id && l.user_id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
        for (const log of sortedLogs) {
            orderLastTouchedBy.set(log.entity_id!, log.user_id);
        }

        return employees.map(emp => {
            // Resolve this employee's effective period
            const manualOverride = periodOverrides.get(emp.id);
            let periodStart: string;
            let periodEnd: string;

            if (manualOverride) {
                periodStart = manualOverride.start;
                periodEnd = manualOverride.end;
            } else if (periodMode === "since_last") {
                const lastPaid = lastPayrollDates.get(emp.id);
                if (lastPaid) {
                    // Day after last payroll
                    const next = new Date(lastPaid + "T00:00:00Z");
                    next.setUTCDate(next.getUTCDate() + 1);
                    periodStart = next.toISOString().split("T")[0];
                } else {
                    periodStart = globalPeriodStart; // No history → use global (90-day fallback)
                }
                periodEnd = globalPeriodEnd;
            } else {
                periodStart = globalPeriodStart;
                periodEnd = globalPeriodEnd;
            }

            const workingDaysInPeriod = countWorkingDays(periodStart, periodEnd);
            const effectiveRate = getEffectiveRate(emp.id, emp.role);

            // Filter logs to this employee's period
            const empLogs = activityLogs.filter(l =>
                l.user_id === emp.id &&
                l.created_at >= periodStart + "T00:00:00Z" &&
                l.created_at <= periodEnd + "T23:59:59Z"
            );

            // Bucket by completion date, not order date — see isCompletedInPeriod.
            const periodCompletedOrders = completedOrders.filter(o =>
                isCompletedInPeriod(o.completed_at, periodStart, periodEnd)
            );

            // Attribution: all completed orders in period OR only those last-touched by this employee
            const attributedOrders = attributionMode === "all"
                ? periodCompletedOrders
                : periodCompletedOrders.filter(o => orderLastTouchedBy.get(o.id) === emp.id);

            // Whole-pipeline status breakdown of every order CREATED in the period
            // (same attribution rule as completed orders, so the two stay consistent).
            const periodAllOrders = allOrders.filter(o =>
                o.created_at >= periodStart + "T00:00:00Z" &&
                o.created_at <= periodEnd + "T23:59:59Z"
            );
            const attributedAllOrders = attributionMode === "all"
                ? periodAllOrders
                : periodAllOrders.filter(o => orderLastTouchedBy.get(o.id) === emp.id);
            const orderStatusBreakdown = buildStatusBreakdown(attributedAllOrders);

            // Classify each completed order into a quality bucket. Only genuine orders pay.
            const bucketRank: Record<OrderBucket, number> = { refund: 0, replacement: 1, genuine: 2 };
            const orderDetails: CountedOrderDetail[] = attributedOrders
                .map(o => ({
                    id: o.id,
                    orderId: o.order_id,
                    customerName: o.customer_name ?? "—",
                    status: o.status,
                    bucket: classifyOrder(o, refundedOriginals),
                    createdAt: o.created_at,
                    completedAt: o.completed_at,
                    // Net of any partial refund, so the drill-down shows what the sale is worth.
                    amount: (o.price ?? 0) - (o.refund_status === "partial" ? (o.refunded_amount ?? 0) : 0),
                    share: keptShare(o),
                }))
                // Flagged orders (refunds, then replacements) first so they stay visible if the list is
                // capped; then most-recently-completed first (the date that placed it in this period).
                .sort((a, b) =>
                    bucketRank[a.bucket] - bucketRank[b.bucket] ||
                    (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)
                );

            let genuine = 0, replacements = 0, refunds = 0;
            for (const d of orderDetails) {
                if (d.bucket === "genuine") genuine++;
                else if (d.bucket === "replacement") replacements++;
                else refunds++;
            }
            const completedTotal = orderDetails.length;
            const orderBreakdown: OrderBreakdown = {
                completedTotal,
                genuine,
                replacements,
                refunds,
                qualityScore: completedTotal > 0 ? genuine / completedTotal : 0,
            };
            // Only genuine deliveries earn the per-order bonus; a partly refunded
            // one earns the share the customer kept.
            const completedOrdersCount = genuine;
            const payableUnits = orderDetails.reduce((sum, d) => sum + (d.bucket === "genuine" ? d.share : 0), 0);

            // Advisory: returns/refunds dated inside an already-paid period for this employee.
            const lastPaid = lastPayrollDates.get(emp.id) ?? null;
            const returnedAfterPayment: ReturnedAfterPayment[] = lastPaid
                ? returnOrders
                    .filter(r => r.created_at <= lastPaid + "T23:59:59Z")
                    .filter(r => attributionMode === "all" || orderLastTouchedBy.get(r.id) === emp.id)
                    .map(r => ({
                        id: r.id,
                        orderId: r.order_id,
                        customerName: r.customer_name ?? "—",
                        createdAt: r.created_at,
                        status: r.status,
                    }))
                : [];

            // Attendance: unique days with any activity log
            const activeDays = new Set(empLogs.map(l => l.created_at.split("T")[0]));
            const absenceDays = Math.max(0, workingDaysInPeriod - activeDays.size);
            const dailyRate = effectiveRate.baseMonthlySalary / WORKING_DAYS_PER_MONTH;
            const absenceDeduction = Math.round(absenceDays * dailyRate);

            const pendingAdvances = advances.filter(a => a.employee_id === emp.id);
            const pendingPenalties = penalties.filter(p => p.employee_id === emp.id);
            const pendingBonuses = bonuses.filter(b => b.employee_id === emp.id);

            const advancesTotal = pendingAdvances.reduce((s, a) => s + a.amount, 0);
            const penaltiesTotal = pendingPenalties.reduce((s, p) => s + p.amount, 0);
            const performanceBonusesTotal = pendingBonuses.reduce((s, b) => s + b.amount, 0);
            const orderBonus = Math.round(payableUnits * effectiveRate.perOrderBonus);

            const grossSalary = effectiveRate.baseMonthlySalary + orderBonus + performanceBonusesTotal;
            const netSalary = Math.max(0, grossSalary - absenceDeduction - advancesTotal - penaltiesTotal);

            const calculation: PayrollCalculation = {
                employeeId: emp.id,
                periodStart,
                periodEnd,
                baseSalary: effectiveRate.baseMonthlySalary,
                completedOrdersCount,
                orderBreakdown,
                orderStatusBreakdown,
                orderBonus,
                pendingBonuses,
                performanceBonusesTotal,
                pendingAdvances,
                advancesTotal,
                pendingPenalties,
                penaltiesTotal,
                absenceDays,
                absenceDeduction,
                grossSalary,
                netSalary,
            };

            return {
                employee: {
                    id: emp.id,
                    displayName: emp.display_name,
                    email: emp.email,
                    role: emp.role,
                    avatarUrl: emp.avatar_url,
                    isActive: emp.is_active,
                },
                effectiveRate,
                calculation,
                lastPayrollDate: lastPayrollDates.get(emp.id) ?? null,
                overlappingPayroll: (() => {
                    const overlap = paidRecordsInWindow.find(
                        r => r.employee_id === emp.id &&
                            r.period_start <= periodEnd &&
                            r.period_end >= periodStart
                    );
                    if (!overlap) return null;
                    return {
                        ...overlap,
                        fullyCovered: overlap.period_start <= periodStart && overlap.period_end >= periodEnd,
                    };
                })(),
                orderDetails,
                returnedAfterPayment,
            };
        });
    }, [
        employees, activityLogs, completedOrders, allOrders, returnOrders, refundedOriginals, attributionMode,
        advances, penalties, bonuses, getEffectiveRate,
        globalPeriodStart, globalPeriodEnd, periodOverrides, lastPayrollDates,
        paidRecordsInWindow, periodMode,
    ]);

    // Business-wide breakdown over the global period (distinct orders — avoids
    // double-counting the same completed orders across employees in "all" mode).
    const periodBreakdown = useMemo((): OrderBreakdown => {
        if (!globalPeriodStart || !globalPeriodEnd) return EMPTY_BREAKDOWN;
        const inPeriod = completedOrders.filter(o =>
            isCompletedInPeriod(o.completed_at, globalPeriodStart, globalPeriodEnd)
        );
        let genuine = 0, replacements = 0, refunds = 0;
        for (const o of inPeriod) {
            const bucket = classifyOrder(o, refundedOriginals);
            if (bucket === "genuine") genuine++;
            else if (bucket === "replacement") replacements++;
            else refunds++;
        }
        const completedTotal = inPeriod.length;
        return {
            completedTotal,
            genuine,
            replacements,
            refunds,
            qualityScore: completedTotal > 0 ? genuine / completedTotal : 0,
        };
    }, [completedOrders, refundedOriginals, globalPeriodStart, globalPeriodEnd]);

    const totalDue = useMemo(
        () => employeePayrollData.reduce((s, e) => s + e.calculation.netSalary, 0),
        [employeePayrollData]
    );
    const totalPendingAdvances = useMemo(
        () => advances.reduce((s, a) => s + a.amount, 0),
        [advances]
    );
    const totalPendingPenalties = useMemo(
        () => penalties.reduce((s, p) => s + p.amount, 0),
        [penalties]
    );

    return {
        employeePayrollData,
        isLoading,
        totalDue,
        totalPendingAdvances,
        totalPendingPenalties,
        periodBreakdown,
        lastPayrollDates,
        refresh: fetchData,
    };
}
