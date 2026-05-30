"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    PackageX,
    CheckCircle,
    XCircle,
    ArrowRightLeft,
    Microscope,
    FileText,
    History,
    ExternalLink,
    Flame,
    Check,
    Save,
    User,
} from "lucide-react";
import { cn, formatIQD, formatDate } from "@/lib/utils";
import type { QCItem, QCReasonCategory, QCResolution, QCStatus } from "@/types/product";
import { QCStatusBadge } from "./qc-status-badge";
import { QCAgingChip } from "./qc-aging-chip";
import { QC_REASON_META, INSPECTION_CHECKLISTS, autoTagReason } from "./qc-constants";
import { QCPhotoUploader } from "./qc-photo-uploader";
import { useQCEvents, useInventoryQC } from "@/hooks/use-inventory-qc";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

interface QCDetailDrawerProps {
    item: QCItem | null;
    allItems: QCItem[];
    onClose: () => void;
}

export function QCDetailDrawer({ item, allItems, onClose }: QCDetailDrawerProps) {
    const { t } = useLanguage();
    const { resolveItem, updateStatus, updateNotes, updateReasonCategory, addPhotos, removePhoto } = useInventoryQC();
    const { data: events } = useQCEvents(item?.id || null);

    const [notes, setNotes] = useState(item?.notes || "");
    const [rmaNumber, setRmaNumber] = useState(item?.rma_number || "");
    const [creditExpected, setCreditExpected] = useState<string>(
        item?.credit_expected != null ? String(item.credit_expected) : ""
    );
    const [checklistState, setChecklistState] = useState<boolean[]>([]);
    const [savingNotes, setSavingNotes] = useState(false);
    const [pendingResolution, setPendingResolution] = useState<QCResolution | null>(null);
    const [reasonCatOverride, setReasonCatOverride] = useState<QCReasonCategory | null>(null);

    useEffect(() => {
        if (item) {
            setNotes(item.notes || "");
            setRmaNumber(item.rma_number || "");
            setCreditExpected(item.credit_expected != null ? String(item.credit_expected) : "");
            const reasonCat = item.reason_category || autoTagReason(item.reason);
            const list = INSPECTION_CHECKLISTS[reasonCat] || [];
            setChecklistState(list.map(() => false));
            setReasonCatOverride(null);
        }
    }, [item]);

    useEffect(() => {
        if (!item) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [item, onClose]);

    const reasonCat: QCReasonCategory = useMemo(
        () =>
            reasonCatOverride ??
            ((item?.reason_category as QCReasonCategory) || autoTagReason(item?.reason || "")),
        [item, reasonCatOverride]
    );
    const reasonMeta = QC_REASON_META[reasonCat];
    const checklist = INSPECTION_CHECKLISTS[reasonCat] || [];

    // Similar items in last 14d for the same product
    const similar = useMemo(() => {
        if (!item?.product_id) return [];
        const fourteenAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        return allItems.filter(
            (i) =>
                i.id !== item.id &&
                i.product_id === item.product_id &&
                new Date(i.created_at).getTime() >= fourteenAgo
        );
    }, [item, allItems]);

    const value = item ? (item.product?.cost || 0) * item.quantity : 0;
    const isResolved = item ? ["restocked", "written_off", "returned_to_supplier"].includes(item.status) : false;

    const handleSaveNotes = async () => {
        if (!item) return;
        setSavingNotes(true);
        try {
            await updateNotes(item.id, notes);
            toast.success(t("qc.detail.notesSaved"));
        } catch {
            toast.error(t("qc.detail.notesFailed"));
        } finally {
            setSavingNotes(false);
        }
    };

    const handleResolve = async (resolution: QCResolution) => {
        if (!item) return;
        const extras: { rma_number?: string; credit_expected?: number; notes?: string } = {};
        if (resolution === "returned_to_supplier") {
            if (!rmaNumber) {
                toast.warning(t("qc.detail.rmaRequired"));
                return;
            }
            extras.rma_number = rmaNumber;
            if (creditExpected) extras.credit_expected = Number(creditExpected);
        }
        if (notes && notes !== item.notes) extras.notes = notes;

        setPendingResolution(resolution);
        try {
            await resolveItem(item.id, resolution, item.product_id, item.quantity, extras);
            const key =
                resolution === "restocked"
                    ? "qc.detail.resolved.restocked"
                    : resolution === "written_off"
                        ? "qc.detail.resolved.writtenOff"
                        : "qc.detail.resolved.returned";
            toast.success(t(key));
            onClose();
        } catch {
            toast.error(t("qc.detail.resolutionFailed"));
        } finally {
            setPendingResolution(null);
        }
    };

    const handleStartInspection = async () => {
        if (!item) return;
        try {
            await updateStatus(item.id, "in_inspection");
            toast.success(t("qc.detail.inspectionStarted"));
        } catch {
            toast.error(t("qc.detail.inspectionFailed"));
        }
    };

    const handleReasonChange = async (cat: QCReasonCategory) => {
        if (!item) return;
        const prev = reasonCatOverride;
        setReasonCatOverride(cat);
        try {
            await updateReasonCategory(item.id, cat);
            toast.success(t("qc.detail.reasonUpdated"));
        } catch {
            setReasonCatOverride(prev);
            toast.error(t("qc.detail.reasonFailed"));
        }
    };

    return (
        <AnimatePresence>
            {item && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                    />
                    <motion.aside
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 32 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="qc-detail-drawer-title"
                        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:max-w-xl lg:max-w-2xl bg-[var(--card-bg)] shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)] z-10">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                    <Microscope className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-muted uppercase tracking-wider">{t("qc.detail.eyebrow")}</p>
                                    <h2 id="qc-detail-drawer-title" className="text-lg font-bold truncate">{item.product?.name || t("qc.unknownProduct")}</h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <QCStatusBadge status={item.status} size="md" />
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-[var(--background)] transition"
                                >
                                    <X className="w-5 h-5 text-muted" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                            {/* Product hero */}
                            <div className="flex items-start gap-4 p-4 bg-[var(--background)]/60 rounded-xl">
                                <div className="w-20 h-20 rounded-xl overflow-hidden bg-[var(--card-bg)] flex-shrink-0 flex items-center justify-center">
                                    {item.product?.image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <PackageX className="w-8 h-8 text-muted" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {item.product?.sku && (
                                            <span className="px-2 py-0.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md text-xs font-medium">
                                                {item.product.sku}
                                            </span>
                                        )}
                                        <QCAgingChip createdAt={item.created_at} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-muted">{t("qc.detail.quantity")}</p>
                                            <p className="font-bold tabular-nums">{item.quantity}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted">{t("qc.detail.unitCost")}</p>
                                            <p className="font-bold tabular-nums">{formatIQD(item.product?.cost || 0)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted">{t("qc.detail.valueAtRisk")}</p>
                                            <p className="font-bold tabular-nums text-rose-600">{formatIQD(value)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Similar recent items warning */}
                            {similar.length >= 2 && (
                                <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                                    <Flame className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="font-semibold text-orange-800">{t("qc.detail.recurringTitle")}</p>
                                        <p className="text-orange-700/80">
                                            {t("qc.detail.recurringDesc", { count: similar.length })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Order context */}
                            {item.order?.order_id && (
                                <div className="p-3 bg-[var(--background)]/60 rounded-xl">
                                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{t("qc.detail.originatingOrder")}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-[var(--accent)]">#{item.order.order_id}</span>
                                        <ExternalLink className="w-4 h-4 text-muted" />
                                    </div>
                                </div>
                            )}

                            {/* Reason taxonomy */}
                            <section>
                                <h3 className="text-sm font-bold mb-2">{t("qc.detail.reason")}</h3>
                                <p className="text-sm text-muted mb-2 italic">"{item.reason}"</p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(QC_REASON_META) as QCReasonCategory[]).map((cat) => {
                                        const meta = QC_REASON_META[cat];
                                        const ReasonIcon = meta.icon;
                                        const isActive = reasonCat === cat;
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => handleReasonChange(cat)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition",
                                                    isActive
                                                        ? "bg-amber-500 border-amber-500 text-white"
                                                        : "bg-[var(--background)] border-[var(--card-border)] hover:border-amber-500/50"
                                                )}
                                            >
                                                <ReasonIcon className="w-3 h-3" />
                                                {t(`qc.reason.${cat}`)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* Photo evidence */}
                            <section>
                                <h3 className="text-sm font-bold mb-2">{t("qc.detail.photoEvidence")}</h3>
                                <QCPhotoUploader
                                    qcItemId={item.id}
                                    photos={item.photos || []}
                                    onAdd={async (urls) => {
                                        await addPhotos(item.id, urls);
                                    }}
                                    onRemove={async (url) => {
                                        await removePhoto(item.id, url);
                                    }}
                                />
                            </section>

                            {/* Checklist */}
                            <section>
                                <h3 className="text-sm font-bold mb-2">{t("qc.detail.checklist")}</h3>
                                <ul className="space-y-1.5">
                                    {checklist.map((task, idx) => (
                                        <li key={task}>
                                            <button
                                                onClick={() => {
                                                    setChecklistState((prev) => prev.map((v, i) => (i === idx ? !v : v)));
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition",
                                                    checklistState[idx]
                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                                                        : "bg-[var(--background)]/50 border-[var(--card-border)] hover:border-amber-500/30"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition",
                                                        checklistState[idx]
                                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                                            : "border-[var(--card-border)]"
                                                    )}
                                                >
                                                    {checklistState[idx] && <Check className="w-3 h-3" />}
                                                </span>
                                                <span className={checklistState[idx] ? "line-through opacity-70" : ""}>
                                                    {t(task)}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* Notes */}
                            <section>
                                <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                                    <FileText className="w-4 h-4" /> {t("qc.detail.notes")}
                                </h3>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder={t("qc.detail.notesPlaceholder")}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                                />
                                {notes !== (item.notes || "") && (
                                    <button
                                        onClick={handleSaveNotes}
                                        disabled={savingNotes}
                                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        {t("qc.detail.saveNotes")}
                                    </button>
                                )}
                            </section>

                            {/* RMA (for return) */}
                            {(item.status === "returned_to_supplier" || (!isResolved && pendingResolution === "returned_to_supplier")) && (
                                <section className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl space-y-2">
                                    <h3 className="text-sm font-bold flex items-center gap-1.5 text-violet-900">
                                        <ArrowRightLeft className="w-4 h-4" /> {t("qc.detail.returnSection")}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs font-medium text-muted">{t("qc.detail.rmaLabel")}</label>
                                            <input
                                                value={rmaNumber}
                                                onChange={(e) => setRmaNumber(e.target.value)}
                                                placeholder="RMA-..."
                                                className="w-full px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted">{t("qc.detail.creditLabel")}</label>
                                            <input
                                                type="number"
                                                value={creditExpected}
                                                onChange={(e) => setCreditExpected(e.target.value)}
                                                placeholder="0"
                                                className="w-full px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md text-sm tabular-nums"
                                            />
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Activity log */}
                            {events && events.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                                        <History className="w-4 h-4" /> {t("qc.detail.activityLog")}
                                    </h3>
                                    <ul className="space-y-2">
                                        {events.map((ev) => (
                                            <li key={ev.id} className="flex items-start gap-2 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <User className="w-3 h-3 text-muted" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium">
                                                        {ev.event_type === "status_changed" && ev.payload
                                                            ? t("qc.activity.statusChanged", {
                                                                  from: t(`qc.status.${ev.payload.from}`),
                                                                  to: t(`qc.status.${ev.payload.to}`),
                                                              })
                                                            : ev.event_type === "created"
                                                              ? t("qc.activity.created")
                                                              : ev.event_type.replace(/_/g, " ")}
                                                    </p>
                                                    <p className="text-xs text-muted">{formatDate(ev.created_at)}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </div>

                        {/* Footer actions */}
                        {!isResolved && (
                            <div className="border-t border-[var(--card-border)] px-6 py-4 bg-[var(--card-bg)] space-y-2">
                                {item.status === "pending_inspection" && (
                                    <button
                                        onClick={handleStartInspection}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-500/20 transition"
                                    >
                                        <Microscope className="w-4 h-4" />
                                        {t("qc.detail.startInspection")}
                                    </button>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => handleResolve("restocked")}
                                        disabled={!!pendingResolution}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition disabled:opacity-50"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        {t("qc.detail.restock")}
                                    </button>
                                    <button
                                        onClick={() => handleResolve("written_off")}
                                        disabled={!!pendingResolution}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-500 text-white rounded-lg text-sm font-semibold hover:bg-rose-600 transition disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        {t("qc.detail.writeOff")}
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!rmaNumber) {
                                                setPendingResolution("returned_to_supplier");
                                                toast.warning(t("qc.detail.rmaEnterFirst"));
                                                return;
                                            }
                                            handleResolve("returned_to_supplier");
                                        }}
                                        disabled={!!pendingResolution}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-violet-500 text-white rounded-lg text-sm font-semibold hover:bg-violet-600 transition disabled:opacity-50"
                                    >
                                        <ArrowRightLeft className="w-4 h-4" />
                                        {t("qc.detail.return")}
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
