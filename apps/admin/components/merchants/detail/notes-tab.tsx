"use client";

import { useMemo } from "react";
import { Pin, PinOff, StickyNote, Sparkles, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/shared/mention-textarea";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

interface NotesTabProps {
  notes: MerchantDetail["notes"];
  noteText: string;
  setNoteText: (v: string) => void;
  onSubmit?: () => void;
}

const AVATAR_GRADIENTS = [
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
  "from-indigo-500 to-purple-500",
  "from-lime-400 to-green-500",
  "from-fuchsia-400 to-pink-500",
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function shortId(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

function initialFor(seed: string): string {
  const trimmed = seed.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

type Note = MerchantDetail["notes"][number];

function NoteRow({ note }: { note: Note }) {
  const seed = note.admin_user_id || note.id;
  const gradient = gradientFor(seed);
  const initial = initialFor(seed);
  const authorLabel = `Admin ${shortId(note.admin_user_id || note.id)}`;
  const wasEdited = note.updated_at !== note.created_at;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border p-4 transition-colors",
        note.is_pinned
          ? "border-amber-300/50 dark:border-amber-400/30 bg-gradient-to-br from-amber-50/80 via-orange-50/60 to-amber-50/30 dark:from-amber-400/10 dark:via-orange-400/5 dark:to-amber-400/[0.03]"
          : "border-foreground/[0.06] bg-foreground/[0.02] hover:bg-foreground/[0.04]"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black tracking-tight bg-gradient-to-br ring-2 ring-white/40 dark:ring-white/10",
            gradient
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-foreground truncate">{authorLabel}</p>
            {note.is_pinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-amber-500/30 ring-1 ring-white/20">
                <Pin className="w-2.5 h-2.5" />
                Pinned
              </span>
            )}
            <span className="text-[10px] text-foreground/45 font-medium tabular-nums">
              {relativeTime(note.created_at)}
            </span>
            {wasEdited && (
              <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/35">
                edited
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap break-words">
            {note.content}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title={note.is_pinned ? "Unpin note" : "Pin note"}
            aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              note.is_pinned
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
                : "bg-foreground/5 text-foreground/55 hover:bg-foreground/10 hover:text-foreground"
            )}
          >
            {note.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotesTab({ notes, noteText, setNoteText, onSubmit }: NotesTabProps) {
  const sorted = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [notes]);

  const pinnedCount = useMemo(() => notes.filter((n) => n.is_pinned).length, [notes]);
  const canSubmit = noteText.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl p-5 border border-violet-200 dark:border-violet-400/30 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/5">
        <div
          aria-hidden
          className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30 bg-violet-300"
        />

        <div className="relative flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
            <Sparkles className="w-3 h-3" />
            New internal note
          </p>
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
            Visible to admins only
          </span>
        </div>

        <div className="relative rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm focus-within:ring-2 focus-within:ring-violet-400/40 transition-shadow">
          <MentionTextarea
            value={noteText}
            onChange={setNoteText}
            onSubmit={onSubmit}
            placeholder="Jot a note... use @ to mention a teammate"
            rows={3}
            className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none resize-none"
          />
        </div>

        <div className="relative flex items-center justify-between mt-3">
          <p className="text-[10px] text-foreground/50 font-medium">
            <span className="tabular-nums font-bold text-foreground/70">{noteText.length}</span>
            <span className="ml-1">chars</span>
          </p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all",
              canSubmit
                ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95"
                : "bg-foreground/5 text-foreground/30 cursor-not-allowed"
            )}
          >
            <Send className="w-3 h-3" />
            Add note
          </button>
        </div>
      </div>

      <div className="pastel-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
            <StickyNote className="w-3 h-3" />
            Notes
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-foreground/[0.05] text-[9px] font-black uppercase tracking-wider text-foreground/55 tabular-nums">
              {notes.length} total
            </span>
            {pinnedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-amber-500/30 ring-1 ring-white/20 tabular-nums">
                <Pin className="w-2.5 h-2.5" />
                {pinnedCount} pinned
              </span>
            )}
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="relative overflow-hidden flex flex-col items-center text-center py-10 px-6 rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/5 border border-violet-200 dark:border-violet-400/20">
            <div
              aria-hidden
              className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-40 bg-violet-300"
            />
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-md shadow-violet-500/30 ring-1 ring-white/30 mb-4">
              <StickyNote className="w-5 h-5 text-white" />
            </div>
            <h3 className="relative text-base font-bold text-foreground">No notes yet</h3>
            <p className="relative text-xs text-foreground/55 mt-1 max-w-[280px] leading-relaxed">
              Capture context the next admin will thank you for. Pin the important ones so they
              stay at the top.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
