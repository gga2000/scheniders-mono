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
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupportCaseAction } from "@/hooks/use-support-cases";
import { useSavedReplies } from "@/hooks/use-saved-replies";
import { SavedRepliesDialog } from "@/components/support/saved-replies-dialog";
import {
  SUPPORT_REASONS,
  SUPPORT_REASON_LABELS,
  SUPPORT_STATUS_LABELS,
  fillSavedReply,
  latestOrderNumber,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportReason,
} from "@/lib/support";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** What the merchant was looking at, shown under their message. */
function ContextChips({ message }: { message: SupportMessageRow }) {
  const { path, orderNumber, errorCode, errorMessage, sentryEventId } = message.context;
  if (!path && !orderNumber && !errorCode && !errorMessage) return null;
  const chip = "inline-flex max-w-full items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/70";
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
          className={cn(chip, "bg-red-100 text-red-800")}
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

function MessageLine({ message }: { message: SupportMessageRow }) {
  if (message.sender_kind === "system") {
    const solved = message.body === "solved";
    return (
      <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-foreground/50">
        {solved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
        {solved
          ? `Marked solved${message.sender_name ? ` by ${message.sender_name}` : ""}`
          : "Merchant said it is not solved. Reopened."}
        <span className="text-foreground/30">· {formatTime(message.created_at)}</span>
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
          <p className="mb-1 text-[11px] text-foreground/50">The picture of the screen is no longer stored.</p>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>
      </div>
      {!fromStaff && <ContextChips message={message} />}
      <span className="mt-1 text-[11px] text-foreground/40">
        {message.sender_name ? `${message.sender_name} · ` : ""}
        {formatTime(message.created_at)}
      </span>
    </div>
  );
}

interface SupportConversationProps {
  supportCase: SupportCaseRow;
  messages: SupportMessageRow[];
}

export function SupportConversation({ supportCase, messages }: SupportConversationProps) {
  const [draft, setDraft] = useState("");
  const [solving, setSolving] = useState(false);
  const [reason, setReason] = useState<SupportReason | "">("");
  const [editingReplies, setEditingReplies] = useState(false);
  const action = useSupportCaseAction(supportCase.id);
  const savedReplies = useSavedReplies();
  const endRef = useRef<HTMLDivElement>(null);
  const isSolved = supportCase.status === "solved";
  const lastMessageId = messages.at(-1)?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastMessageId]);

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
              onClick={() => setSolving((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-green-600/40 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark solved
            </button>
          </div>
        )}
      </div>

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
        {messages.map((message) => (
          <MessageLine key={message.id} message={message} />
        ))}
        {isSolved && supportCase.rating && (
          <p className="py-1 text-center text-xs font-medium text-foreground/50">
            {supportCase.rating === "yes" ? "Merchant confirmed: solved." : "Merchant said: not solved."}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {isSolved ? (
        <div className="flex items-center gap-2 border-t border-[var(--card-border)] px-4 py-3 text-xs text-foreground-muted">
          <MessageSquareText className="h-4 w-4" />
          Solved. If the merchant writes again, a new conversation opens in the inbox.
        </div>
      ) : (
        <div className="border-t border-[var(--card-border)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
                className="rounded-full border border-[var(--card-border)] px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                {saved.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEditingReplies(true)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
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
