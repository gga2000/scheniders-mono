"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/shared/mention-textarea";

interface QuickNotePopoverProps {
  merchantId: string;
}

export function QuickNotePopover({ merchantId }: QuickNotePopoverProps) {
  const [open, setOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch latest notes
  const { data: notes } = useQuery<
    Array<{ id: string; content: string; created_at: string; is_pinned: boolean }>
  >({
    queryKey: ["admin", "merchant-notes", merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/notes?limit=3`);
      if (!res.ok) throw new Error("Failed to fetch notes");
      const data = await res.json();
      return data.notes ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/merchants/${merchantId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      return res.json();
    },
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant-notes", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    },
  });

  const handleSubmit = () => {
    if (!noteText.trim() || addNote.isPending) return;
    addNote.mutate(noteText.trim());
  };

  const noteCount = notes?.length ?? 0;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn(
          "p-1 rounded-md transition-colors relative",
          open
            ? "text-foreground/70 bg-foreground/5"
            : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
        )}
        title="Quick note"
        aria-label="Quick note"
      >
        <StickyNote className="w-4 h-4" />
        {noteCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-foreground text-background text-[8px] font-bold flex items-center justify-center">
            {noteCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-64 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {/* Input area */}
          <div className="p-3 border-b border-[var(--card-border)]">
            <div className="flex gap-2">
              <MentionTextarea
                value={noteText}
                onChange={setNoteText}
                onSubmit={handleSubmit}
                placeholder="Add a quick note... @ to mention"
                rows={2}
                autoFocus={open}
              />
              <button
                onClick={handleSubmit}
                disabled={!noteText.trim() || addNote.isPending}
                className="self-end p-2 rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
              >
                {addNote.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Recent notes */}
          {notes && notes.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="px-3 py-2 border-b border-[var(--card-border)] last:border-0"
                >
                  <p className="text-[11px] text-foreground line-clamp-2">{note.content}</p>
                  <span className="text-[9px] text-foreground/30 mt-0.5 block">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-[11px] text-foreground/30">
              No notes yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
