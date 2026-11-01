"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, XCircle, PackageX, MessageSquare, Pencil, Check, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { useOrderReasons, useReasonUsage } from "@/hooks/use-order-reasons";
import { ReasonListEditor } from "@/components/orders/reason-list-editor";
import { reasonUsageCount, reasonColorDot, isFallbackReason } from "@/lib/order-reasons";

interface CancellationReasonDialogProps {
    open: boolean;
    onClose: () => void;
    /** reasonId is the stable order_reasons.id when available (omitted for free-text/fallback). */
    onConfirm: (reason: string, reasonId?: string) => void;
    customerName?: string;
    orderId?: string;
    type?: "cancel" | "reject";
}

export function CancellationReasonDialog({
    open,
    onClose,
    onConfirm,
    customerName,
    orderId,
    type = "cancel",
}: CancellationReasonDialogProps) {
    const isReject = type === "reject";
    const kind = isReject ? "reject" : "cancel";

    const { can } = usePermission();
    const isAdmin = can(PERMISSIONS.ACCESS_SETTINGS);

    const { reasons: allReasons, isFallback, isLoading } = useOrderReasons(kind, { enabled: open });
    const { usage } = useReasonUsage(kind, { enabled: open });
    const reduceMotion = useReducedMotion();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [customReason, setCustomReason] = useState("");
    const [editMode, setEditMode] = useState(false);

    const activeReasons = useMemo(() => allReasons.filter((r) => r.is_active), [allReasons]);
    const selected = activeReasons.find((r) => r.id === selectedId) || null;
    const needsNote = selected?.requires_note ?? false;

    const counts = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of activeReasons) m[r.id] = reasonUsageCount(usage, r);
        return m;
    }, [activeReasons, usage]);
    const maxCount = useMemo(
        () =>
            Math.max(
                1,
                ...activeReasons.filter((r) => !r.requires_note).map((r) => counts[r.id] ?? 0),
            ),
        [activeReasons, counts],
    );
    const topReasonId = useMemo(() => {
        let bestId: string | null = null;
        let best = 0;
        for (const r of activeReasons) {
            if (r.requires_note) continue;
            const c = counts[r.id] ?? 0;
            if (c > best) {
                best = c;
                bestId = r.id;
            }
        }
        return best > 0 ? bestId : null;
    }, [activeReasons, counts]);

    const accent: "rose" | "orange" = isReject ? "orange" : "rose";
    const headerTitle = isReject ? "رفض الطلب" : "إلغاء الطلب";
    const stageBadge = isReject ? "بعد الشحن" : "قبل الشحن";
    const description = isReject
        ? "يُستخدم عند رفض الطلب أو إرجاعه بعد شحنه — عند التسليم."
        : "يُستخدم عند إلغاء الطلب قبل شحنه.";
    const confirmButtonText = isReject ? "تأكيد الرفض" : "تأكيد الإلغاء";
    const promptText = isReject ? "اختر سبب الرفض" : "اختر سبب الإلغاء";
    const customPlaceholder = isReject ? "اكتب سبب الرفض..." : "اكتب سبب الإلغاء...";
    const StageIcon = isReject ? PackageX : XCircle;

    const handleClose = () => {
        setSelectedId(null);
        setCustomReason("");
        setEditMode(false);
        onClose();
    };

    const handleConfirm = () => {
        if (!selected) return;
        const reason = needsNote ? customReason.trim() : selected.label_ar;
        if (!reason) return;
        const reasonId = isFallbackReason(selected) ? undefined : selected.id;
        onConfirm(reason, reasonId);
        handleClose();
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (editMode) setEditMode(false);
                else handleClose();
            }
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editMode]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            >
                <motion.div
                    layout
                    role="dialog"
                    aria-modal="true"
                    aria-label={headerTitle}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full overflow-hidden dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] transition-[max-width]",
                        editMode ? "max-w-lg" : "max-w-md",
                    )}
                >
                    {/* Header */}
                    <div
                        className={cn(
                            "flex items-start justify-between px-5 py-4 border-b border-[var(--card-border)]",
                            isReject ? "bg-orange-50 dark:bg-orange-500/10" : "bg-rose-50 dark:bg-rose-500/10",
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                    isReject ? "bg-orange-100 dark:bg-orange-500/20" : "bg-rose-100 dark:bg-rose-500/20",
                                )}
                            >
                                <StageIcon
                                    className={cn(
                                        "w-5 h-5",
                                        isReject
                                            ? "text-orange-600 dark:text-orange-400"
                                            : "text-rose-600 dark:text-rose-400",
                                    )}
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-foreground">{headerTitle}</h3>
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full",
                                            isReject
                                                ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                                                : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
                                        )}
                                    >
                                        <Truck className="w-2.5 h-2.5" />
                                        {stageBadge}
                                    </span>
                                </div>
                                {orderId && (
                                    <p className="text-xs text-muted mt-0.5">الطلب #{orderId}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            {isAdmin && (
                                <button
                                    onClick={() => setEditMode((v) => !v)}
                                    title={editMode ? "تم" : "تعديل الأسباب"}
                                    aria-label={editMode ? "إنهاء التعديل" : "تعديل الأسباب"}
                                    aria-pressed={editMode}
                                    className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                        editMode
                                            ? isReject
                                                ? "bg-orange-500 text-white"
                                                : "bg-rose-500 text-white"
                                            : isReject
                                                ? "hover:bg-orange-100 dark:hover:bg-orange-500/20 text-orange-600 dark:text-orange-400"
                                                : "hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400",
                                    )}
                                >
                                    {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
                                </button>
                            )}
                            <button
                                onClick={handleClose}
                                aria-label="إغلاق"
                                className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    isReject
                                        ? "hover:bg-orange-100 dark:hover:bg-orange-500/20"
                                        : "hover:bg-rose-100 dark:hover:bg-rose-500/20",
                                )}
                            >
                                <X className="w-4 h-4 text-muted" />
                            </button>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="px-5 pt-2.5">
                        <p className="text-xs text-muted leading-relaxed">{description}</p>
                    </div>

                    {/* Content */}
                    <div className="relative">
                        <div className="px-4 pb-4 pt-2.5 max-h-[55vh] overflow-y-auto">
                            {editMode ? (
                                <ReasonListEditor
                                    kind={kind}
                                    reasons={allReasons}
                                    accent={accent}
                                    usage={usage}
                                    isFallback={isFallback}
                                />
                            ) : isLoading && activeReasons.length === 0 ? (
                                <div className="space-y-1.5" aria-hidden>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="h-[52px] rounded-xl bg-[var(--background)] animate-pulse" />
                                    ))}
                                </div>
                            ) : activeReasons.length === 0 ? (
                                <div className="py-10 text-center">
                                    <p className="text-sm text-muted">لا توجد أسباب متاحة.</p>
                                    {isAdmin && (
                                        <button
                                            onClick={() => setEditMode(true)}
                                            className={cn(
                                                "mt-2 text-sm font-medium",
                                                isReject
                                                    ? "text-orange-600 dark:text-orange-400"
                                                    : "text-rose-600 dark:text-rose-400",
                                            )}
                                        >
                                            + إضافة سبب
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-muted mb-2.5">
                                        {promptText}
                                        {customerName ? ` للعميل ${customerName}` : ""}:
                                    </p>

                                    <div className="space-y-1.5" role="radiogroup" aria-label={promptText}>
                                        {activeReasons.map((reason, index) => {
                                            const isSelected = selectedId === reason.id;
                                            const count = counts[reason.id] ?? 0;
                                            const isTop = reason.id === topReasonId;
                                            const barColor =
                                                reasonColorDot(reason.color) ??
                                                (isReject ? "bg-orange-400" : "bg-rose-400");
                                            return (
                                                <motion.button
                                                    key={reason.id}
                                                    onClick={() => setSelectedId(reason.id)}
                                                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        delay: reduceMotion ? 0 : index * 0.03,
                                                        duration: 0.18,
                                                    }}
                                                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                                                    role="radio"
                                                    aria-checked={isSelected}
                                                    aria-label={reason.label_ar}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--card-bg)]",
                                                        isReject
                                                            ? "focus-visible:ring-orange-400"
                                                            : "focus-visible:ring-rose-400",
                                                        isSelected
                                                            ? isReject
                                                                ? "bg-orange-100 ring-2 ring-orange-400 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-500/50"
                                                                : "bg-rose-100 ring-2 ring-rose-400 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/50"
                                                            : "bg-[var(--background)] hover:bg-gray-100 dark:hover:bg-white/5 text-foreground",
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "w-9 h-9 rounded-full grid place-items-center shrink-0 transition-colors",
                                                            isSelected
                                                                ? isReject
                                                                    ? "bg-orange-500 text-white dark:bg-orange-400 dark:text-orange-950"
                                                                    : "bg-rose-500 text-white dark:bg-rose-400 dark:text-rose-950"
                                                                : "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                                        )}
                                                    >
                                                        {isSelected ? (
                                                            <Check className="w-4 h-4" />
                                                        ) : reason.emoji ? (
                                                            <span className="text-lg leading-none">{reason.emoji}</span>
                                                        ) : (
                                                            <span
                                                                className={cn(
                                                                    "w-3 h-3 rounded-full",
                                                                    reasonColorDot(reason.color) ?? "bg-muted/40",
                                                                )}
                                                            />
                                                        )}
                                                    </span>

                                                    <span className="flex-1 min-w-0 font-medium truncate" title={reason.label_ar}>
                                                        {reason.label_ar}
                                                    </span>

                                                    {!reason.requires_note && count > 0 && (
                                                        <span
                                                            className="flex items-center gap-1.5 shrink-0 w-20"
                                                            title={`${count} مرة`}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "text-[11px] font-semibold tabular-nums",
                                                                    isTop
                                                                        ? isReject
                                                                            ? "text-orange-600 dark:text-orange-400"
                                                                            : "text-rose-600 dark:text-rose-400"
                                                                        : "text-muted",
                                                                )}
                                                            >
                                                                {count}
                                                            </span>
                                                            <span className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                                                                <span
                                                                    className={cn(
                                                                        "block h-full rounded-full",
                                                                        barColor,
                                                                        !isTop && "opacity-60",
                                                                    )}
                                                                    style={{
                                                                        width: `${Math.max(8, (count / maxCount) * 100)}%`,
                                                                    }}
                                                                />
                                                            </span>
                                                        </span>
                                                    )}
                                                </motion.button>
                                            );
                                        })}
                                    </div>

                                    {/* Free-text note input */}
                                    {needsNote && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="mt-3"
                                        >
                                            <div className="relative">
                                                <MessageSquare className="absolute right-3 top-3 w-4 h-4 text-muted" />
                                                <textarea
                                                    value={customReason}
                                                    onChange={(e) => setCustomReason(e.target.value)}
                                                    placeholder={customPlaceholder}
                                                    className={cn(
                                                        "w-full h-24 pr-10 pl-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm resize-none focus:outline-none focus:ring-2 focus:border-transparent",
                                                        isReject
                                                            ? "focus:ring-orange-400 dark:focus:ring-orange-500/50"
                                                            : "focus:ring-rose-400 dark:focus:ring-rose-500/50",
                                                    )}
                                                    autoFocus
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </>
                            )}
                        </div>
                        {!editMode && activeReasons.length > 4 && (
                            <>
                                <div className="pointer-events-none absolute top-0 inset-x-0 h-5 bg-gradient-to-b from-[var(--card-bg)] to-transparent" />
                                <div className="pointer-events-none absolute bottom-0 inset-x-0 h-5 bg-gradient-to-t from-[var(--card-bg)] to-transparent" />
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    {!editMode && (
                        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-[var(--background)] border-t border-[var(--card-border)] transition-colors">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-white/5"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!selected || (needsNote && !customReason.trim())}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all min-w-0 max-w-[68%]",
                                    selected && (!needsNote || customReason.trim())
                                        ? isReject
                                            ? "bg-orange-500 text-white hover:bg-orange-600 shadow-md dark:shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                                            : "bg-rose-500 text-white hover:bg-rose-600 shadow-md dark:shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-white/5 dark:text-[#A1A1A1]",
                                )}
                            >
                                <XCircle className="w-4 h-4 shrink-0" />
                                <span className="truncate">
                                    {confirmButtonText}
                                    {selected && !needsNote ? ` · ${selected.label_ar}` : ""}
                                </span>
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
