"use client";

import { Plus, StickyNote, Pin } from "lucide-react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

interface NotesTabProps {
  notes: MerchantDetail["notes"];
  noteText: string;
  setNoteText: (v: string) => void;
  onSubmit?: () => void;
}

export function NotesTab({ notes, noteText, setNoteText, onSubmit }: NotesTabProps) {
  return (
    <div className="space-y-5">
      {/* Add Note Form */}
      <div className="pastel-card p-5 md:p-6">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Note
        </h2>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write an admin note..."
          rows={3}
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/10 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={onSubmit}
            disabled={!noteText.trim()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Add Note
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="pastel-card p-5 md:p-6">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
          <StickyNote className="w-4 h-4" />
          Notes ({notes.length})
        </h2>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
            <StickyNote className="w-8 h-8 mb-2" />
            <p className="text-sm">No notes yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3 rounded-xl bg-foreground/[0.02] border border-[var(--card-border)]"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground/40">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    {note.is_pinned && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                        <Pin className="w-3 h-3" />
                        Pinned
                      </span>
                    )}
                  </div>
                  {note.updated_at !== note.created_at && (
                    <span className="text-[10px] text-foreground/30">
                      edited {new Date(note.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
