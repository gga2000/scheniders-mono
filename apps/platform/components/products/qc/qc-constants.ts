import type { LucideIcon } from "lucide-react";
import { Bomb, Clock, AlertTriangle, ArrowLeftRight, Undo2, HelpCircle } from "lucide-react";
import type { QCStatus, QCReasonCategory } from "@/types/product";

export const QC_STATUS_META: Record<
    QCStatus,
    { color: string; bg: string; dot: string }
> = {
    pending_inspection: {
        color: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-500/10 border-amber-500/30",
        dot: "bg-amber-500",
    },
    in_inspection: {
        color: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-500/10 border-blue-500/30",
        dot: "bg-blue-500",
    },
    restocked: {
        color: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-500/10 border-emerald-500/30",
        dot: "bg-emerald-500",
    },
    written_off: {
        color: "text-rose-700 dark:text-rose-300",
        bg: "bg-rose-500/10 border-rose-500/30",
        dot: "bg-rose-500",
    },
    returned_to_supplier: {
        color: "text-violet-700 dark:text-violet-300",
        bg: "bg-violet-500/10 border-violet-500/30",
        dot: "bg-violet-500",
    },
};

export const QC_REASON_META: Record<
    QCReasonCategory,
    { icon: LucideIcon; color: string; bg: string }
> = {
    damaged: { icon: Bomb, color: "text-rose-600", bg: "bg-rose-500/10" },
    expired: { icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10" },
    defective: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/10" },
    wrong_item: { icon: ArrowLeftRight, color: "text-sky-600", bg: "bg-sky-500/10" },
    returned: { icon: Undo2, color: "text-violet-600", bg: "bg-violet-500/10" },
    other: { icon: HelpCircle, color: "text-slate-600", bg: "bg-slate-500/10" },
};

export const INSPECTION_CHECKLISTS: Record<QCReasonCategory, string[]> = {
    damaged: [
        "qc.checklist.damaged.0",
        "qc.checklist.damaged.1",
        "qc.checklist.damaged.2",
        "qc.checklist.damaged.3",
        "qc.checklist.damaged.4",
    ],
    expired: [
        "qc.checklist.expired.0",
        "qc.checklist.expired.1",
        "qc.checklist.expired.2",
        "qc.checklist.expired.3",
        "qc.checklist.expired.4",
    ],
    defective: [
        "qc.checklist.defective.0",
        "qc.checklist.defective.1",
        "qc.checklist.defective.2",
        "qc.checklist.defective.3",
        "qc.checklist.defective.4",
    ],
    wrong_item: [
        "qc.checklist.wrong_item.0",
        "qc.checklist.wrong_item.1",
        "qc.checklist.wrong_item.2",
        "qc.checklist.wrong_item.3",
        "qc.checklist.wrong_item.4",
    ],
    returned: [
        "qc.checklist.returned.0",
        "qc.checklist.returned.1",
        "qc.checklist.returned.2",
        "qc.checklist.returned.3",
        "qc.checklist.returned.4",
    ],
    other: [
        "qc.checklist.other.0",
        "qc.checklist.other.1",
        "qc.checklist.other.2",
    ],
};

export function getAgingBucket(createdAt: string): {
    days: number;
    label: string;
    color: string;
    urgency: "low" | "medium" | "high" | "critical";
} {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days < 3) return { days, label: `${days}d`, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", urgency: "low" };
    if (days < 7) return { days, label: `${days}d`, color: "text-amber-600 bg-amber-500/10 border-amber-500/20", urgency: "medium" };
    if (days < 14) return { days, label: `${days}d`, color: "text-orange-600 bg-orange-500/10 border-orange-500/20", urgency: "high" };
    return { days, label: `${days}d`, color: "text-rose-600 bg-rose-500/10 border-rose-500/20", urgency: "critical" };
}

export function autoTagReason(reason: string): QCReasonCategory {
    const r = reason.toLowerCase();
    if (/\b(damag|broken|crack|dent|torn|smash)/i.test(r)) return "damaged";
    if (/\b(expir|stale|past date|outdated)/i.test(r)) return "expired";
    if (/\b(defect|faulty|malfunction|not work|fail)/i.test(r)) return "defective";
    if (/\b(wrong|mismatch|incorrect)/i.test(r)) return "wrong_item";
    if (/\b(return|refund|rejected|customer)/i.test(r)) return "returned";
    return "other";
}
