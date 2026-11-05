"use client";

import { useState } from "react";
import { Package, Search, Wind } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillSetScentNotes } from "@/hooks/use-till";
import type { TillProduct } from "@/lib/till/cart";
import { MAX_NOTES, SCENT_NOTES } from "@/lib/till/scent";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

/**
 * Managers give each bottle up to 6 scent notes, so cashiers can find bottles
 * by note and offer similar ones. Each tap saves.
 */
export function TillScentDialog({ sessionId, products, onClose }: { sessionId: string; products: TillProduct[]; onClose: () => void }) {
    const { t } = useLanguage();
    const save = useTillSetScentNotes();
    const [query, setQuery] = useState("");
    const [onlyEmpty, setOnlyEmpty] = useState(() => products.some((p) => p.notes.length === 0));
    // Notes as tapped here, ahead of the products refetch.
    const [edits, setEdits] = useState<Map<string, string[]>>(() => new Map());
    const [open, setOpen] = useState<string | null>(null);

    const notesOf = (p: TillProduct) => edits.get(p.id) ?? p.notes;
    const empty = products.filter((p) => notesOf(p).length === 0).length;
    const q = query.trim().toLowerCase();
    const shown = products.filter((p) => (!onlyEmpty || p.notes.length === 0 || edits.has(p.id)) && (!q || p.name.toLowerCase().includes(q)));

    const toggle = (p: TillProduct, note: string) => {
        const had = notesOf(p);
        if (!had.includes(note) && had.length >= MAX_NOTES) {
            toast({ title: t("till.scent.max", { n: MAX_NOTES }), variant: "warning" });
            return;
        }
        const next = had.includes(note) ? had.filter((n) => n !== note) : [...had, note];
        setEdits((prev) => new Map(prev).set(p.id, next));
        // Keep this bottle open while its notes are being picked.
        setOpen(p.id);
        save.mutate(
            { sessionId, productId: p.id, notes: next },
            {
                onError: () => {
                    setEdits((prev) => new Map(prev).set(p.id, had));
                    toast({ title: t("till.scent.failed"), variant: "error" });
                },
            },
        );
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="till-screen md:max-w-3xl">
                <div className="flex max-h-[80vh] flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <Wind className="h-5 w-5" aria-hidden="true" />
                            {t("till.scent.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {t("till.scent.subtitle", { n: MAX_NOTES })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-2xl border border-[var(--card-border)] px-4 focus-within:border-[var(--ink)]">
                            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("till.scent.search")}
                                aria-label={t("till.scent.search")}
                                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                                dir="auto"
                            />
                        </label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={onlyEmpty}
                            onClick={() => setOnlyEmpty((v) => !v)}
                            className={cn(
                                "h-12 rounded-2xl border px-4 text-sm font-semibold",
                                onlyEmpty ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                            )}
                        >
                            {t("till.scent.onlyEmpty", { n: empty })}
                        </button>
                    </div>

                    <ul className="-mx-1 flex min-h-0 flex-1 flex-col divide-y divide-[var(--card-border)] overflow-y-auto px-1">
                        {shown.map((p) => {
                            const mine = notesOf(p);
                            const expanded = open === p.id || mine.length === 0;
                            return (
                                <li key={p.id} className="flex flex-col gap-2 py-3">
                                    <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex items-center gap-3 text-left" aria-expanded={expanded}>
                                        <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                                            {p.image_url ? (
                                                <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <span className="flex h-full items-center justify-center text-muted">
                                                    <Package className="h-4 w-4" aria-hidden="true" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-left text-sm font-semibold text-foreground" dir="auto">{p.name}</span>
                                            <span className="truncate text-left text-xs text-muted" dir="auto">
                                                {mine.length ? mine.map((n) => t(`till.scent.note.${n}`)).join(" · ") : t("till.scent.none")}
                                            </span>
                                        </span>
                                        {mine.length > 0 && <span className="shrink-0 text-xs font-semibold text-muted">{expanded ? t("till.scent.done") : t("till.scent.edit")}</span>}
                                    </button>
                                    {expanded && (
                                        <div className="flex flex-wrap gap-1.5 ps-14">
                                            {SCENT_NOTES.map((note) => {
                                                const on = mine.includes(note);
                                                return (
                                                    <button
                                                        key={note}
                                                        type="button"
                                                        aria-pressed={on}
                                                        onClick={() => toggle(p, note)}
                                                        className={cn(
                                                            "h-9 rounded-full border px-3 text-[13px] font-semibold",
                                                            on ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                                        )}
                                                    >
                                                        {t(`till.scent.note.${note}`)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                        {shown.length === 0 && (
                            <li className="py-6 text-left text-sm text-muted" dir="auto">
                                {onlyEmpty && !q ? t("till.scent.allDone") : t("till.count.noMatch")}
                            </li>
                        )}
                    </ul>
                </div>
            </DialogContent>
        </Dialog>
    );
}
