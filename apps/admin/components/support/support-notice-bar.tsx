"use client";

import { useState } from "react";
import { Loader2, Megaphone, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import {
  useSupportNotice,
  useSupportNoticeEnd,
  useSupportNoticePost,
  useSupportSpike,
} from "@/hooks/use-support-cases";
import { NOTICE_DURATIONS, formatDuration } from "@/lib/support";
import { StaleLine } from "@/components/shared/stale-line";

const MAX_LENGTH = 300;

/**
 * The notice every merchant sees at the top of their Help chat ("Prime is
 * slow today, orders still go out"). Staff post one, see the live one and end
 * it here; a new notice replaces the old one. When several shops write about
 * the same thing and no notice is live, it offers a notice already written.
 */
export function SupportNoticeBar() {
  const notice = useSupportNotice();
  const post = useSupportNoticePost();
  const end = useSupportNoticeEnd();
  const spike = useSupportSpike();
  const [dismissedTopic, setDismissedTopic] = useState<string | null>(null);
  const now = useLiveTick(60_000);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");
  const [hours, setHours] = useState<number>(6);

  const live = notice.data ?? null;
  const text = body.trim();
  // A notice not yet posted, typed or taken from the problem spotter, survives
  // an ended sign-in's reload: leaving asks first.
  useLeaveGuard(writing && text !== "");

  const submit = () => {
    if (text === "" || post.isPending) return;
    post.mutate(
      { body: text, hours },
      {
        onSuccess: () => {
          setWriting(false);
          setBody("");
          toast.success("Every merchant now sees this notice in their Help chat");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  if (writing) {
    return (
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
        <label htmlFor="support-notice-body" className="text-sm font-semibold text-foreground">
          Notice for every merchant
        </label>
        <p className="mt-0.5 text-xs text-foreground-muted">
          Shows at the top of their Help chat. Write it in Arabic, the way merchants speak.
          {live && " It replaces the notice that is live now."}
        </p>
        <textarea
          id="support-notice-body"
          dir="auto"
          rows={2}
          value={body}
          maxLength={MAX_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          placeholder="برايم متأخر اليوم بالتوصيل، الطلبات تطلع بس ممكن تتأخر يوم."
          className="mt-3 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Show for</span>
          {NOTICE_DURATIONS.map((d) => (
            <button
              key={d.hours}
              type="button"
              aria-pressed={hours === d.hours}
              onClick={() => setHours(d.hours)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                hours === d.hours
                  ? "bg-foreground text-background"
                  : "border border-[var(--card-border)] text-foreground hover:bg-foreground/5",
              )}
            >
              {d.label}
            </button>
          ))}
          <span className="ml-auto text-xs tabular-nums text-foreground-muted">
            {body.length}/{MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => setWriting(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={text === "" || post.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-fg)] disabled:opacity-40"
          >
            {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            Post notice
          </button>
        </div>
      </div>
    );
  }

  if (live) {
    const left = Math.max(0, (Date.parse(live.ends_at) - now) / 1000);
    return (
      <div className="space-y-2">
      <StaleLine read={notice} what="the merchant notice" kept="page" />
      <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-500/5 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-amber)]" />
        <div className="min-w-0 flex-1">
          <p dir="auto" className="text-sm font-medium text-foreground">
            {live.body}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Every merchant sees this in their Help chat. Posted by {live.created_by_name}, ends in{" "}
            {formatDuration(left)}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-foreground hover:bg-foreground/5"
        >
          Replace
        </button>
        <button
          type="button"
          disabled={end.isPending}
          onClick={() =>
            end.mutate(undefined, {
              onSuccess: () => toast.success("Notice ended"),
              onError: (error) => toast.error(error.message),
            })
          }
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs font-semibold text-foreground hover:bg-foreground/5 disabled:opacity-40"
        >
          {end.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          End now
        </button>
      </div>
      </div>
    );
  }

  const suggestion = spike.data && spike.data.topic !== dismissedTopic ? spike.data : null;
  if (suggestion) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-500/5 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-amber)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{suggestion.label}.</p>
          <p className="mt-0.5 text-xs text-foreground-muted">Tell every merchant at once? A notice is written below; you can change it before posting.</p>
          <p dir="auto" className="mt-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-foreground">
            {suggestion.notice}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBody(suggestion.notice);
            setWriting(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-fg)]"
        >
          <Megaphone className="h-3.5 w-3.5" />
          Use this notice
        </button>
        <button
          type="button"
          onClick={() => setDismissedTopic(suggestion.topic)}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground"
        >
          Not now
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-2.5">
      {/* With no notice read, the bar cannot say whether one is live; it never prints the error's own text. */}
      {notice.isError && !notice.data ? (
        <p className="text-sm text-[var(--ink-red)]">
          Could not check for a live notice.{" "}
          <button
            type="button"
            disabled={notice.isFetching}
            onClick={() => void notice.refetch()}
            className="font-semibold underline disabled:opacity-50"
          >
            Try again
          </button>
        </p>
      ) : (
        <p className="text-sm text-foreground-muted">
          Something affecting many shops? Tell every merchant at once in their Help chat.
        </p>
      )}
      <button
        type="button"
        onClick={() => setWriting(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-semibold text-foreground hover:bg-foreground/5"
      >
        <Megaphone className="h-3.5 w-3.5" />
        Post a notice
      </button>
    </div>
  );
}
