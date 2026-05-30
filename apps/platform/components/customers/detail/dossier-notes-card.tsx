"use client";

import { motion } from "framer-motion";
import { StickyNote, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useDeleteCustomerNote } from "@/hooks/use-customer-notes";
import type { CustomerNote, VoiceNote } from "@/types/customer";

type NoteType = "INFO" | "POSITIVE" | "VOICE";

function detectNoteType(content: string): NoteType {
    const lower = content.toLowerCase();
    if (
        lower.includes("great") ||
        lower.includes("good") ||
        lower.includes("happy") ||
        lower.includes("excellent") ||
        lower.includes("vip") ||
        lower.includes("loyal")
    ) {
        return "POSITIVE";
    }
    return "INFO";
}

const typeBadgeClasses: Record<NoteType, string> = {
    INFO: "bg-white/60 text-muted-foreground",
    POSITIVE: "bg-[#FBE38E]/30 text-foreground border-l-4 border-[#FBE38E]",
    VOICE: "bg-cyan-50 text-cyan-700",
};

interface DossierNotesCardProps {
    notes: CustomerNote[];
    voiceNotes: VoiceNote[];
    phone: string;
    onAddNote?: () => void;
    onPlayVoice?: (noteId: string) => void;
}

export function DossierNotesCard({ notes, voiceNotes, phone, onAddNote }: DossierNotesCardProps) {
    const { t } = useLanguage();
    const deleteNote = useDeleteCustomerNote(phone);

    const allEntries = [
        ...notes.map(n => ({
            type: "text" as const,
            id: n.id,
            date: n.created_at,
            content: n.note,
            noteType: detectNoteType(n.note),
            author: "Agent",
        })),
        ...voiceNotes.map(v => ({
            type: "voice" as const,
            id: v.id,
            date: v.created_at,
            content: v.text_note || t("customers.voice.title"),
            noteType: "VOICE" as NoteType,
            author: v.recorded_by || "Agent",
            duration: v.duration_seconds,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                {allEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">
                        {t("customers.profile.noNotes")}
                    </p>
                ) : (
                    allEntries.map((entry, i) => (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group/note bg-muted/30 p-5 rounded-2xl relative"
                        >
                            {/* Note header: author + date | type badge */}
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">
                                    {entry.author}&nbsp;·&nbsp;
                                    {new Date(entry.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                    {entry.type === "voice" && ` · ${entry.duration}s`}
                                </p>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span
                                        className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${typeBadgeClasses[entry.noteType]}`}
                                    >
                                        {entry.noteType}
                                    </span>
                                    {entry.type === "text" && (
                                        <button
                                            onClick={() => deleteNote.mutate(entry.id)}
                                            disabled={deleteNote.isPending}
                                            className="opacity-0 group-hover/note:opacity-100 transition-opacity p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                                            aria-label="Delete note"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Content */}
                            <p className="text-sm text-foreground font-medium leading-relaxed line-clamp-3">
                                {entry.content}
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
                    className="absolute -bottom-4 -right-4 w-12 h-12 rounded-full bg-[#33605a] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
                >
                    <Plus className="w-5 h-5" />
                </motion.button>
            )}
        </div>
    );
}
