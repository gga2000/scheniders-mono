"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Package,
  Pencil,
  RotateCcw,
  Send,
  StickyNote,
  UserCheck,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupportCaseAction, useSupportMarkSeen, useSupportTeam } from "@/hooks/use-support-cases";
import { useSavedReplies } from "@/hooks/use-saved-replies";
import { SavedRepliesDialog } from "@/components/support/saved-replies-dialog";
import {
  NOTE_MAX_LENGTH,
  SUPPORT_REASONS,
  SUPPORT_REASON_LABELS,
  SUPPORT_STATUS_LABELS,
  fillSavedReply,
  latestOrderNumber,
  supportTimeline,
  type SupportCaseNote,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportReason,
} from "@/lib/support";
import { formatDayTime } from "@/lib/format";

/** What the merchant was looking at, shown under their message. */
function ContextChips({ message }: { message: SupportMessageRow }) {
  const { path, orderNumber, errorCode, errorMessage, sentryEventId } = message.context;
  if (!path && !orderNumber && !errorCode && !errorMessage) return null;
  const chip = "inline-flex max-w-full items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/70";
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {path && (
        <span className={chip} title="Page the merchant was on">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{path}</span>
        </span>
      )}
      {orderNumber && (
        <span className={chip} title="Order open on their screen">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">#{orderNumber}</span>
        </span>
      )}
      {(errorCode || errorMessage) && (
        <span
          className={cn(chip, "bg-red-500/15 text-[var(--ink-red)]")}
          title={sentryEventId ? `Sentry event ${sentryEventId}` : "Error they saw"}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span dir="auto" className="truncate">
            {errorMessage ?? errorCode}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The page refetches every few seconds and each answer signs a fresh link.
 * Keep the first one so a note that is playing does not restart; take the
 * newest only when the kept one stops working (it lasts 15 minutes).
 */
function VoiceNote({ url }: { url: string }) {
  const [src, setSrc] = useState(url);
  return (
    <audio
      controls
      preload="none"
      src={src}
      onError={() => setSrc(url)}
      aria-label="Voice note from the merchant"
      className="mb-2 h-9 w-64 max-w-full"
    />
  );
}

function MessageLine({ message }: { message: SupportMessageRow }) {
  if (message.sender_kind === "system") {
    const solved = message.body === "solved";
    return (
      <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-foreground/70">
        {solved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
        {solved
          ? `Marked solved${message.sender_name ? ` by ${message.sender_name}` : ""}`
          : "Merchant said it is not solved. Reopened."}
        <span className="text-foreground/70">· {formatDayTime(message.created_at)}</span>
      </div>
    );
  }

  const fromStaff = message.sender_kind === "staff";
  return (
    <div className={cn("flex flex-col", fromStaff ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5",
          fromStaff ? "bg-foreground text-background" : "border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground",
        )}
      >
        {message.screenshot_url && (
          <a
            href={message.screenshot_url}
            target="_blank"
            rel="noreferrer"
            className="mb-2 block"
            title="Open the picture full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset */}
            <img
              src={message.screenshot_url}
              alt="Picture of the merchant's screen"
              className="max-h-64 w-full rounded-lg border border-[var(--card-border)] object-cover object-top"
            />
          </a>
        )}
        {message.context.screenshot && !message.screenshot_url && (
          <p className="mb-1 text-xs text-foreground/70">The picture of the screen is no longer stored.</p>
        )}
        {message.voice_url && <VoiceNote url={message.voice_url} />}
        {message.context.voice && !message.voice_url && (
          <p className="mb-1 text-xs text-foreground/70">The voice note is no longer stored.</p>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>
      </div>
      {!fromStaff && <ContextChips message={message} />}
      <span className="mt-1 text-xs text-foreground/70">
        {message.sender_name ? `${message.sender_name} · ` : ""}
        {formatDayTime(message.created_at)}
      </span>
    </div>
  );
}

/** A line only staff see: a note, or a hand-over to a teammate. */
function NoteLine({ note }: { note: SupportCaseNote }) {
  if (note.kind === "handover") {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <UserRoundCog className="h-3.5 w-3.5" />
          {note.admin_name} handed this to {note.to_name}
          <span>· {formatDayTime(note.created_at)}</span>
        </div>
        {note.body && (
          <p
            dir="auto"
            className="max-w-[78%] whitespace-pre-wrap break-words rounded-xl border border-dashed border-amber-400/70 bg-amber-500/5 px-3 py-2 text-sm text-foreground dark:border-amber-500/40 dark:bg-amber-500/10"
          >
            {note.body}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-amber-400/70 bg-amber-500/5 px-3.5 py-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-amber)]">
        <StickyNote className="h-3.5 w-3.5" />
        Staff note · the merchant does not see this
      </p>
      <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {note.body}
      </p>
      <p className="mt-1 text-xs text-foreground/70">
        {note.admin_name} · {formatDayTime(note.created_at)}
      </p>
    </div>
  );
}

/** Pick a teammate, add an optional note, hand the conversation over. */
function HandOverPanel({
  supportCase,
  onDone,
}: {
  supportCase: SupportCaseRow;
  onDone: () => void;
}) {
  const team = useSupportTeam();
  const action = useSupportCaseAction(supportCase.id);
  const [toAdminId, setToAdminId] = useState("");
  const [note, setNote] = useState("");
  const choices = (team.data ?? []).filter((mate) => mate.id !== supportCase.owner_admin_id);

  const handOver = () => {
    if (!toAdminId || action.isPending) return;
    const text = note.trim();
    action.mutate(
      { action: "hand_over", toAdminId, ...(text ? { note: text } : {}) },
      {
        onSuccess: () => {
          const mate = choices.find((m) => m.id === toAdminId);
          toast.success(`Handed to ${mate?.name ?? "your teammate"}`);
          onDone();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="space-y-2 border-b border-[var(--card-border)] bg-foreground/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="support-hand-to" className="text-xs font-semibold text-foreground">
          Hand to
        </label>
        <select
          id="support-hand-to"
          value={toAdminId}
          onChange={(event) => setToAdminId(event.target.value)}
          disabled={team.isLoading}
          className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-sm text-foreground"
        >
          <option value="">{team.isLoading ? "Loading the team" : "Pick a teammate"}</option>
          {choices.map((mate) => (
            <option key={mate.id} value={mate.id}>
              {mate.isMe ? `${mate.name} (me)` : mate.name}
            </option>
          ))}
        </select>
        {team.isError && <span className="text-xs text-[var(--ink-red)]">{team.error.message}</span>}
      </div>
      <textarea
        dir="auto"
        rows={2}
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What should they know? (only staff see this, optional)"
        aria-label="Note for your teammate"
        className="w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handOver}
          disabled={!toAdminId || action.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--primary-fg)] transition-opacity disabled:opacity-40"
        >
          {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRoundCog className="h-3.5 w-3.5" />}
          Hand over
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          Cancel
        </button>
        <span className="text-xs text-foreground-muted">They become the owner. The merchant is not told.</span>
      </div>
    </div>
  );
}

interface SupportConversationProps {
  supportCase: SupportCaseRow;
  messages: SupportMessageRow[];
  notes: SupportCaseNote[];
}

export function SupportConversation({ supportCase, messages, notes }: SupportConversationProps) {
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [solving, setSolving] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const [reason, setReason] = useState<SupportReason | "">("");
  const [editingReplies, setEditingReplies] = useState(false);
  const action = useSupportCaseAction(supportCase.id);
  const savedReplies = useSavedReplies();
  const endRef = useRef<HTMLDivElement>(null);
  const isSolved = supportCase.status === "solved";
  const timeline = supportTimeline(messages, notes);
  const lastItemKey = timeline.length > 0 ? `${timeline.length}:${timeline[timeline.length - 1].at}` : "";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastItemKey]);

  // "Seen by Noor" for the merchant: only once this conversation is on a
  // screen someone is looking at, not from a console left in a hidden tab.
  const { mutate: sendSeen } = useSupportMarkSeen(supportCase.id);
  const lastMerchantId = messages.findLast((m) => m.sender_kind === "merchant")?.id;
  useEffect(() => {
    if (!lastMerchantId) return;
    let sent = false;
    const mark = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      sendSeen();
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [lastMerchantId, sendSeen]);

  const saveNote = () => {
    const body = noteDraft.trim();
    if (!body || action.isPending) return;
    action.mutate(
      { action: "note", body },
      {
        onSuccess: () => {
          setNoteDraft("");
          if (!isSolved) setMode("reply");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const send = () => {
    const body = draft.trim();
    if (!body || action.isPending) return;
    action.mutate(
      { action: "reply", body },
      {
        onSuccess: () => setDraft(""),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const solve = () => {
    if (!reason || action.isPending) return;
    action.mutate(
      { action: "solve", reason },
      {
        onSuccess: () => {
          setSolving(false);
          setReason("");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const take = () =>
    action.mutate({ action: "assign" }, { onError: (error) => toast.error(error.message) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 py-3">
        <div className="min-w-0">
          <p dir="auto" className="truncate text-sm font-bold text-foreground">
            {supportCase.opened_by_name}
            <span className="font-normal text-foreground-muted">
              {supportCase.tenants ? ` · ${supportCase.tenants.business_name}` : ""}
            </span>
          </p>
          <p className="text-xs text-foreground-muted">
            {SUPPORT_STATUS_LABELS[supportCase.status]}
            {" · "}
            {supportCase.owner_name ? `Owner: ${supportCase.owner_name}` : "No owner yet"}
            {supportCase.reopened_count > 0 ? ` · Reopened ${supportCase.reopened_count}x` : ""}
          </p>
        </div>
        {!isSolved && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={take}
              disabled={action.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Take it
            </button>
            <button
              type="button"
              onClick={() => {
                setHandingOver((v) => !v);
                setSolving(false);
              }}
              aria-expanded={handingOver}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <UserRoundCog className="h-3.5 w-3.5" />
              Hand over
            </button>
            <button
              type="button"
              onClick={() => {
                setSolving((v) => !v);
                setHandingOver(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-green-600/40 px-3 py-1.5 text-xs font-semibold text-[var(--ink-green)] transition-colors hover:bg-green-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark solved
            </button>
          </div>
        )}
      </div>

      {handingOver && !isSolved && (
        <HandOverPanel supportCase={supportCase} onDone={() => setHandingOver(false)} />
      )}

      {solving && !isSolved && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--card-border)] bg-foreground/[0.03] px-4 py-3">
          <label htmlFor="support-reason" className="text-xs font-semibold text-foreground">
            What was it about?
          </label>
          <select
            id="support-reason"
            value={reason}
            onChange={(event) => {
              const next = SUPPORT_REASONS.find((r) => r === event.target.value);
              setReason(next ?? "");
            }}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-sm text-foreground"
          >
            <option value="">Pick a reason</option>
            {SUPPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {SUPPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={solve}
            disabled={!reason || action.isPending}
            className="rounded-full bg-green-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
          >
            Confirm solved
          </button>
          <span className="text-xs text-foreground-muted">The merchant is asked if it really is solved.</span>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {timeline.map((item) =>
          item.type === "message" ? (
            <MessageLine key={item.message.id} message={item.message} />
          ) : (
            <NoteLine key={item.note.id} note={item.note} />
          ),
        )}
        {isSolved && supportCase.rating && (
          <p className="py-1 text-center text-xs font-medium text-foreground/70">
            {supportCase.rating === "yes" ? "Merchant confirmed: solved." : "Merchant said: not solved."}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {isSolved && mode === "reply" ? (
        <div className="flex items-center gap-2 border-t border-[var(--card-border)] px-4 py-3 text-xs text-foreground-muted">
          <MessageSquareText className="h-4 w-4" />
          Solved. If the merchant writes again, a new conversation opens in the inbox.
          <button
            type="button"
            onClick={() => setMode("note")}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-2.5 py-1 font-semibold text-foreground hover:bg-foreground/5"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Add a staff note
          </button>
        </div>
      ) : mode === "note" ? (
        <div className="border-t border-[var(--card-border)] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <ComposerTabs mode={mode} onChange={setMode} solved={isSolved} />
          </div>
          <div className="flex items-end gap-2">
            <textarea
              dir="auto"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Only staff see this. What did you check, what are you waiting on?"
              aria-label="Staff note"
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-dashed border-amber-400/70 bg-amber-500/5 px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-amber-500/40 dark:bg-amber-500/10"
            />
            <button
              type="button"
              onClick={saveNote}
              disabled={noteDraft.trim().length === 0 || action.isPending}
              className="inline-flex h-[52px] items-center gap-2 rounded-xl border border-amber-500/50 px-4 text-sm font-semibold text-[var(--ink-amber)] transition-opacity hover:bg-amber-500/10 disabled:opacity-40"
            >
              {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              Save note
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-[var(--card-border)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <ComposerTabs mode={mode} onChange={setMode} solved={isSolved} />
            <span className="mx-1 h-4 w-px bg-[var(--card-border)]" aria-hidden />
            {(savedReplies.data ?? []).map((saved) => (
              <button
                key={saved.id}
                type="button"
                title={saved.body}
                onClick={() =>
                  setDraft(
                    fillSavedReply(saved.body, {
                      name: supportCase.opened_by_name,
                      shop: supportCase.tenants?.business_name,
                      order: latestOrderNumber(messages),
                    }),
                  )
                }
                className="rounded-full border border-[var(--card-border)] px-2.5 py-1 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                {saved.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEditingReplies(true)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              Edit replies
            </button>
          </div>
          <SavedRepliesDialog open={editingReplies} onOpenChange={setEditingReplies} />
          <div className="flex items-end gap-2">
            <textarea
              dir="auto"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Write a reply to the merchant"
              aria-label="Reply to the merchant"
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <button
              type="button"
              onClick={send}
              disabled={draft.trim().length === 0 || action.isPending}
              className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-fg)] transition-opacity disabled:opacity-40"
            >
              {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Switch the box under the conversation between a reply and a staff note. */
function ComposerTabs({
  mode,
  onChange,
  solved,
}: {
  mode: "reply" | "note";
  onChange: (mode: "reply" | "note") => void;
  solved: boolean;
}) {
  const tab = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
      active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
    );
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Write a reply or a staff note">
      <button type="button" aria-pressed={mode === "reply"} onClick={() => onChange("reply")} className={tab(mode === "reply")}>
        <Send className="h-3 w-3" />
        {solved ? "Back" : "Reply"}
      </button>
      <button type="button" aria-pressed={mode === "note"} onClick={() => onChange("note")} className={tab(mode === "note")}>
        <StickyNote className="h-3 w-3" />
        Staff note
      </button>
    </div>
  );
}
