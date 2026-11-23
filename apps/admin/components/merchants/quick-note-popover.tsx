"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Send, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/shared/mention-textarea";
import { formatWhen } from "@/lib/format";
import { okOrLoadFailure } from "@/lib/load-failure";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { StaleLine } from "@/components/shared/stale-line";
import { postJson } from "@/lib/send-json";
import { adminFetch } from "@/lib/admin-fetch";
import { useLeaveGuard } from "@/hooks/use-leave-guard";

interface QuickNotePopoverProps {
  merchantId: string;
}

export function QuickNotePopover({ merchantId }: QuickNotePopoverProps) {
  const [open, setOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  // A note being written survives an ended sign-in's reload: leaving asks
  // first. Closing the box keeps the draft, so the guard follows the draft,
  // not the box: closed, leaving asked nothing (round 18).
  useLeaveGuard(noteText.trim() !== "");
  const queryClient = useQueryClient();

  // Fetch latest notes
  const notesRead = useQuery<
    Array<{ id: string; content: string; created_at: string; is_pinned: boolean }>
  >({
    queryKey: ["admin", "merchant-notes", merchantId],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch(`/api/merchants/${merchantId}/notes?limit=3`), "the notes");
      const data = await res.json();
      return data.notes ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });
  const notes = notesRead.data;

  const addNote = useMutation({
    // A refused save keeps the typed note and says why, in the server's words.
    mutationFn: (content: string) => postJson(`/api/merchants/${merchantId}/notes`, { content }),
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
    // Drawn over the page (round 17, Craft new 6): inside the card it opened
    // to the left and, on the first card at 1280, ran under the menu.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "p-1 rounded-md transition-colors relative",
            open
              ? "text-foreground/70 bg-foreground/5"
              : "text-foreground/70 hover:text-foreground/70 hover:bg-foreground/5"
          )}
          title="Quick note"
          aria-label="Quick note"
        >
          <StickyNote className="w-4 h-4" />
          {noteCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 leading-none rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">
              {noteCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        aria-label="Quick note"
        onClick={(e) => e.stopPropagation()}
        // Escape in the @ list closes the list only, not the note.
        onEscapeKeyDown={(e) => {
          if (e.target instanceof Element && e.target.closest("[data-mention-list=open]")) e.preventDefault();
        }}
        className="w-64 p-0 rounded-xl border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl"
      >
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
              type="button"
              onClick={handleSubmit}
              title="Send note"
              aria-label="Send note"
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
          {addNote.isError && (
            <p role="alert" className="mt-1.5 text-xs text-[var(--ink-red)]">
              Not saved. {addNote.error.message}
            </p>
          )}
        </div>

        {/* Recent notes. A failed refresh keeps the notes shown, under this line. */}
        <StaleLine read={notesRead} what="the notes" kept="list" className="px-3 py-2 text-xs" />
        {notesRead.isError && !notes ? (
          <LoadFailedLine
            className="justify-center px-3 py-4 text-xs"
            what="the notes"
            error={notesRead.error}
            onRetry={() => void notesRead.refetch()}
            retrying={notesRead.isFetching}
          />
        ) : notes && notes.length > 0 ? (
          <div className="max-h-40 overflow-y-auto">
            {notes.map((note) => (
              <div
                key={note.id}
                className="px-3 py-2 border-b border-[var(--card-border)] last:border-0"
              >
                <p className="text-xs text-foreground line-clamp-2">{note.content}</p>
                <span className="text-xs text-foreground/70 mt-0.5 block">
                  {formatWhen(note.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-foreground/70">
            No notes yet
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
