"use client";

import { motion } from "framer-motion";
import { StickyNote, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useDeleteCustomerNote } from "@/hooks/use-customer-notes";
import type { CustomerNote } from "@/types/customer";

interface DossierNotesCardProps {
    notes: CustomerNote[];
    phone: string;
    onAddNote?: () => void;
}

export function DossierNotesCard({ notes, phone, onAddNote }: DossierNotesCardProps) {
    const { t } = useLanguage();
    const deleteNote = useDeleteCustomerNote(phone);

    const entries = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <div className="bg-(--card-bg) rounded-[3rem] p-8 shadow-[0_4px_24px_rgba(30,30,30,0.07),0_1px_4px_rgba(30,30,30,0.04)] border border-(--card-border) flex flex-col relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                    <StickyNote className="w-5 h-5 text-orange-400" />
                    <span className="font-headline font-extrabold text-lg text-foreground">
                        {t("customers.profile.dossierNotes")}
                    </span>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {t("customers.profile.addNote")}
                </span>
            </div>

            {/* Notes list */}
            <div
                className="space-y-4 max-h-[240px] overflow-y-auto pr-2"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--card-border) transparent" }}
            >
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">
                        {t("customers.profile.noNotes")}
                    </p>
                ) : (
                    entries.map((entry, i) => (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group/note bg-muted/30 p-5 rounded-2xl relative"
                        >
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="text-xs text-muted-foreground tabular-nums">{entry.created_at.slice(0, 10)}</p>
                                <button
                                    onClick={() => deleteNote.mutate(entry.id)}
                                    disabled={deleteNote.isPending}
                                    className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover/note:opacity-100 focus-visible:opacity-100 transition-opacity -m-2 w-11 h-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                                    aria-label={t("common.delete")}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Content */}
                            <p className="text-sm text-foreground font-medium leading-relaxed line-clamp-3">
                                {entry.note}
                            </p>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Floating add-note button */}
            {onAddNote && (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onAddNote}
                    aria-label={t("customers.profile.addNote")}
                    className="absolute -bottom-4 -right-4 w-12 h-12 rounded-full bg-[#33605a] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
                >
                    <Plus className="w-5 h-5" />
                </motion.button>
            )}
        </div>
    );
}
