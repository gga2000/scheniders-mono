"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, Check, StickyNote, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerTags, useCustomerTagAssignments } from "@/hooks/use-customer-management";
import { useAddCustomerNote } from "@/hooks/use-customer-notes";
import { toast } from "@/hooks/use-toast";
import { tagColorClasses, type TagColor } from "@/types/customer";

interface Assignment { tag_id: string }

/**
 * Inline tag + note quick-actions for a single customer — assign/unassign existing
 * tags, create-and-assign a new one, and drop a note, all without leaving the card
 * or dialog. Reuses the existing tag/note mutations; refreshes the dialog + profile
 * queries on change.
 */
export function CustomerQuickActions({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const qc = useQueryClient();
    const { tags, createTag } = useCustomerTags();
    const { assignments, assignTag, removeTag } = useCustomerTagAssignments(phone);
    const addNote = useAddCustomerNote(phone);

    const [note, setNote] = useState("");
    const [newTag, setNewTag] = useState("");
    const [pendingTag, setPendingTag] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const assignedIds = new Set((assignments as Assignment[]).map((a) => a.tag_id));

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["customer-dialog"] });
        qc.invalidateQueries({ queryKey: ["customer-profile"] });
    };

    const toggle = async (tagId: string) => {
        setPendingTag(tagId);
        try {
            const ok = assignedIds.has(tagId) ? await removeTag(tagId) : await assignTag(tagId);
            if (!ok) toast({ variant: "error", title: t("customers.quick.tagFailed", "Couldn't update the tag. Try again.") });
            refresh();
        } finally {
            setPendingTag(null);
        }
    };

    const create = async () => {
        const name = newTag.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            const existing = tags.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
            const tg = existing ?? (await createTag(name, "blue"));
            if (!tg || !(await assignTag(tg.id))) {
                toast({ variant: "error", title: t("customers.quick.tagFailed", "Couldn't update the tag. Try again.") });
            } else {
                setNewTag("");
            }
            refresh();
        } finally {
            setCreating(false);
        }
    };

    const submitNote = () => {
        const v = note.trim();
        if (!v || addNote.isPending) return;
        addNote.mutate(v, {
            onSuccess: () => {
                setNote("");
                refresh();
            },
            onError: () => toast({ variant: "error", title: t("customers.quick.noteFailed", "Couldn't save the note. Try again.") }),
        });
    };

    return (
        <div className="space-y-3">
            {/* Tags */}
            <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />{t("customers.quick.tags", "Tags")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                        const on = assignedIds.has(tag.id);
                        const theme = tagColorClasses[tag.color as TagColor] ?? tagColorClasses.gray;
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggle(tag.id)}
                                disabled={pendingTag === tag.id}
                                className={cn(
                                    "inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-[12px] font-semibold border transition-all disabled:opacity-50",
                                    on ? cn(theme.bg, theme.text, "border-transparent") : "bg-background text-muted-foreground border-(--card-border) hover:border-foreground/30",
                                )}
                            >
                                {pendingTag === tag.id ? <Loader2 className="w-3 h-3 animate-spin" /> : on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {tag.name}
                            </button>
                        );
                    })}
                    <span className="inline-flex items-center min-h-11 rounded-full border border-dashed border-(--card-border) overflow-hidden">
                        <input
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                            placeholder={t("customers.quick.newTag", "New tag")}
                            className="h-full min-h-11 px-3 text-[12px] bg-transparent outline-none w-24 placeholder:text-muted-foreground/60"
                        />
                        {newTag.trim() && (
                            <button onClick={create} disabled={creating} className="h-full min-h-11 min-w-11 px-2 inline-flex items-center justify-center text-foreground hover:bg-muted/40 disabled:opacity-50" aria-label={t("customers.quick.create", "Create tag")}>
                                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                        )}
                    </span>
                </div>
            </div>

            {/* Note */}
            <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" />{t("customers.quick.note", "Note")}
                </div>
                <div className="flex items-start gap-2">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={1}
                        maxLength={1000}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote(); }}
                        placeholder={t("customers.quick.notePlaceholder", "Add a quick note…")}
                        className="flex-1 min-h-11 rounded-xl bg-background border border-(--card-border) px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10 resize-none"
                    />
                    <button
                        onClick={submitNote}
                        disabled={!note.trim() || addNote.isPending}
                        className="min-h-11 px-4 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-40 shrink-0 inline-flex items-center"
                    >
                        {addNote.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customers.quick.add", "Add")}
                    </button>
                </div>
            </div>
        </div>
    );
}
