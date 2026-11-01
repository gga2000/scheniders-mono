"use client";

import { motion } from "framer-motion";
import { StickyNote, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { formatBaghdadDate } from "@/lib/customer-format";
import { useAuth } from "@/components/auth/auth-provider";
import { useDeleteCustomerNote } from "@/hooks/use-customer-notes";
import { usePermission } from "@/hooks/use-permission";
import { toast } from "@/hooks/use-toast";
import { isAdminRole } from "@/lib/permissions";
import type { CustomerNote } from "@/types/customer";

interface DossierNotesCardProps {
    notes: CustomerNote[];
    onAddNote?: () => void;
}

export function DossierNotesCard({ notes, onAddNote }: DossierNotesCardProps) {
    const { t, language } = useLanguage();
    const { user } = useAuth();
    const { role } = usePermission();
    const deleteNote = useDeleteCustomerNote();
    // Mirrors the database rule: authors delete their own notes, store admins
    // and platform staff any.
    const canDelete = (note: CustomerNote) => isAdminRole(role) || (!!note.created_by && note.created_by === user?.id);
    const onDelete = (id: string) =>
        deleteNote.mutate(id, {
            onError: () => toast({ variant: "error", title: t("customers.profile.noteDeleteFailed") }),
        });

    const entries = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <div className="bg-(--card-bg) rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-(--card-border) flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <StickyNote className="w-5 h-5 text-orange-400" />
                    <span className="font-headline font-extrabold text-lg text-foreground">
                        {t("customers.profile.dossierNotes")}
                    </span>
                </div>
                {onAddNote && (
                    <button
                        onClick={onAddNote}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-(--card-border) text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {t("customers.profile.addNote")}
                    </button>
                )}
            </div>

            {/* Notes list */}
            <div
                className="space-y-2.5 max-h-[240px] overflow-y-auto pr-2"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--card-border) transparent" }}
            >
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        {t("customers.profile.noNotes")}
                    </p>
                ) : (
                    entries.map((entry, i) => (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group/note bg-muted/30 px-4 py-3 rounded-xl relative"
                        >
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="text-xs text-muted-foreground tabular-nums"><bdi>{formatBaghdadDate(entry.created_at, language)}</bdi></p>
                                {canDelete(entry) && <button
                                    onClick={() => onDelete(entry.id)}
                                    disabled={deleteNote.isPending}
                                    className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover/note:opacity-100 focus-visible:opacity-100 transition-opacity -m-2 w-11 h-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                                    aria-label={t("common.delete")}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>}
                            </div>

                            {/* Content */}
                            <p dir="auto" className="text-sm text-foreground font-medium leading-relaxed whitespace-pre-wrap break-words">
                                {entry.note}
                            </p>
                        </motion.div>
                    ))
                )}
            </div>

        </div>
    );
}
