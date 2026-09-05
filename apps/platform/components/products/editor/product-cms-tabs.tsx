"use client";

import { StickyNote } from "lucide-react";
import { NoteCardsTab } from "./note-cards-tab";
import type { NoteCardFormData } from "./note-cards-tab";

interface ProductCMSTabsProps {
    noteCards: NoteCardFormData[];
    onNoteCardsChange: (noteCards: NoteCardFormData[]) => void;
    /** Needed for note-card image uploads; undefined in create mode. */
    productId?: string;
}

export function ProductCMSTabs({
    noteCards,
    onNoteCardsChange,
    productId,
}: ProductCMSTabsProps) {
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex border-b border-[var(--card-border)] bg-[var(--background)]">
                <div className="px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground border-b-2 border-[var(--foreground)]">
                    <StickyNote className="w-4 h-4" />
                    Note cards
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[var(--card-border)] text-muted">
                        {noteCards.length}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                <NoteCardsTab
                    noteCards={noteCards}
                    onChange={onNoteCardsChange}
                    productId={productId}
                />
            </div>
        </div>
    );
}
