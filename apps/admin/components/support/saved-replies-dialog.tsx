"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAddSavedReply, useChangeSavedReply, useRemoveSavedReply, useSavedReplies } from "@/hooks/use-saved-replies";
import type { SupportSavedReply } from "@/lib/support";

interface Draft {
  id: string | null;
  title: string;
  body: string;
  position: string;
}

const EMPTY: Draft = { id: null, title: "", body: "", position: "" };

const input =
  "w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20";

/** The whole team shares one list. Anyone who answers support can change it. */
export function SavedRepliesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const replies = useSavedReplies();
  const add = useAddSavedReply();
  const change = useChangeSavedReply();
  const remove = useRemoveSavedReply();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const saving = add.isPending || change.isPending;

  const edit = (reply: SupportSavedReply) => {
    setConfirmDelete(null);
    setDraft({ id: reply.id, title: reply.title, body: reply.body, position: String(reply.position) });
  };

  const save = () => {
    if (!draft || saving) return;
    const position = draft.position.trim() === "" ? undefined : Number(draft.position);
    const payload = { title: draft.title, body: draft.body, position };
    const done = {
      onSuccess: () => {
        setDraft(null);
        toast.success("Saved reply kept");
      },
      onError: (error: Error) => toast.error(error.message),
    };
    if (draft.id) change.mutate({ id: draft.id, ...payload }, done);
    else add.mutate(payload, done);
  };

  const drop = (reply: SupportSavedReply) => {
    if (confirmDelete !== reply.id) {
      setConfirmDelete(reply.id);
      return;
    }
    remove.mutate(reply.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        if (draft?.id === reply.id) setDraft(null);
        toast.success(`"${reply.title}" removed`);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const titleOk = draft !== null && draft.title.trim().length > 0 && draft.title.trim().length <= 40;
  const bodyOk = draft !== null && draft.body.trim().length > 0 && draft.body.trim().length <= 2000;
  const positionOk = draft !== null && (draft.position.trim() === "" || /^\d{1,6}$/.test(draft.position.trim()));

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(null);
          setConfirmDelete(null);
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--background)] shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-bold text-foreground">Saved replies</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-foreground-muted">
                One list for the whole team. {"{name}"}, {"{shop}"} and {"{order}"} fill in from the conversation.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {replies.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
              </div>
            ) : replies.isError ? (
              <p className="py-6 text-center text-sm text-red-700">{replies.error.message}</p>
            ) : (
              <ul className="space-y-2">
                {(replies.data ?? []).map((reply) => (
                  <li
                    key={reply.id}
                    className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {reply.title}
                        <span className="ml-2 text-[11px] font-medium text-foreground/40">order {reply.position}</span>
                      </p>
                      <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/70">
                        {reply.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => edit(reply)}
                        aria-label={`Edit ${reply.title}`}
                        className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => drop(reply)}
                        disabled={remove.isPending}
                        aria-label={
                          confirmDelete === reply.id ? `Confirm remove ${reply.title}` : `Remove ${reply.title}`
                        }
                        className={
                          confirmDelete === reply.id
                            ? "inline-flex items-center gap-1 rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white"
                            : "rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-red-100 hover:text-red-700"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        {confirmDelete === reply.id && "Remove"}
                      </button>
                    </div>
                  </li>
                ))}
                {replies.data?.length === 0 && (
                  <li className="flex flex-col items-center gap-2 py-6 text-sm text-foreground-muted">
                    <MessageSquareText className="h-5 w-5" />
                    No saved replies yet.
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--card-border)] px-5 py-4">
            {draft ? (
              <div className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    maxLength={40}
                    placeholder="Button name, e.g. Ask order number"
                    aria-label="Button name"
                    className={input}
                  />
                  <input
                    value={draft.position}
                    onChange={(event) => setDraft({ ...draft, position: event.target.value })}
                    inputMode="numeric"
                    placeholder="Order"
                    aria-label="Order in the list (smaller shows first)"
                    title="Smaller shows first"
                    className={`${input} w-24 shrink-0`}
                  />
                </div>
                <textarea
                  dir="auto"
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  rows={3}
                  maxLength={2000}
                  placeholder="The text the merchant gets, in Arabic"
                  aria-label="Reply text"
                  className={`${input} resize-none`}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/60 transition-colors hover:bg-foreground/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!titleOk || !bodyOk || !positionOk || saving}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--primary-fg)] transition-opacity disabled:opacity-40"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {draft.id ? "Save changes" : "Add reply"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(null);
                  setDraft(EMPTY);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
              >
                <Plus className="h-3.5 w-3.5" />
                New saved reply
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
