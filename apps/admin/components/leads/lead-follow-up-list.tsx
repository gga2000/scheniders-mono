"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LeadFollowUp } from "@/types/leads";
import { useCreateFollowUp, useCompleteFollowUp } from "@/hooks/use-lead-follow-ups";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  BellRing,
  Plus,
  X,
} from "lucide-react";

// ── Date Helpers ────────────────────────────────────────────────────────

function isOverdue(date: string): boolean {
  return new Date(date) < new Date();
}

function isToday(date: string): boolean {
  const d = new Date(date);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Props ───────────────────────────────────────────────────────────────

interface LeadFollowUpListProps {
  followUps: LeadFollowUp[];
  leadId: string;
}

// ── Component ───────────────────────────────────────────────────────────

export function LeadFollowUpList({ followUps, leadId }: LeadFollowUpListProps) {
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const createFollowUp = useCreateFollowUp();
  const completeFollowUp = useCompleteFollowUp();

  const upcoming = [...followUps]
    .filter((f) => !f.is_completed)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const completed = [...followUps]
    .filter((f) => f.is_completed)
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? b.created_at).getTime() -
        new Date(a.completed_at ?? a.created_at).getTime()
    );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) return;

    createFollowUp.mutate(
      {
        leadId,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_at: new Date(scheduledAt).toISOString(),
        assigned_to: "",
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setScheduledAt("");
          setShowForm(false);
        },
      }
    );
  }

  function handleComplete(followUpId: string) {
    completeFollowUp.mutate({ leadId, followUpId });
  }

  // ── Empty State ─────────────────────────────────────────────────────

  if (followUps.length === 0 && !showForm) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <BellRing className="w-5 h-5" style={{ color: "var(--muted)" }} />
        </div>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--foreground)" }}
        >
          No follow-ups scheduled
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Stay on top of this lead by scheduling reminders.
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: "var(--primary)",
            color: "var(--primary-fg)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Schedule Follow-up
        </button>
      </div>
    );
  }

  // ── Main Render ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle Form Button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: "var(--primary)",
            color: "var(--primary-fg)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Schedule Follow-up
        </button>
      )}

      {/* Add Follow-up Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-xl p-4"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-4 h-4" style={{ color: "var(--primary)" }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Schedule Follow-up
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Follow-up title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--foreground)",
                }}
              />
              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none transition-colors"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--foreground)",
                }}
              />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--foreground)",
                }}
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createFollowUp.isPending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    background: "var(--primary)",
                    color: "var(--primary-fg)",
                  }}
                >
                  {createFollowUp.isPending ? "Saving..." : "Save Follow-up"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: "var(--muted)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Clock className="w-3.5 h-3.5" />
            Upcoming
            <span
              className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: "var(--card-border)",
                color: "var(--foreground)",
              }}
            >
              {upcoming.length}
            </span>
          </h4>
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {upcoming.map((fu) => (
                <FollowUpCard
                  key={fu.id}
                  followUp={fu}
                  onComplete={() => handleComplete(fu.id)}
                  isCompleting={
                    completeFollowUp.isPending &&
                    completeFollowUp.variables?.followUpId === fu.id
                  }
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Section */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 transition-colors hover:opacity-80"
            style={{ color: "var(--muted)" }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
            <span
              className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: "var(--card-border)",
                color: "var(--foreground)",
              }}
            >
              {completed.length}
            </span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200",
                showCompleted && "rotate-180"
              )}
            />
          </button>
          <AnimatePresence>
            {showCompleted && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-2 overflow-hidden"
              >
                {completed.map((fu) => (
                  <FollowUpCard key={fu.id} followUp={fu} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── Individual Follow-up Card ─────────────────────────────────────────

function FollowUpCard({
  followUp,
  onComplete,
  isCompleting,
}: {
  followUp: LeadFollowUp;
  onComplete?: () => void;
  isCompleting?: boolean;
}) {
  const overdue = !followUp.is_completed && isOverdue(followUp.scheduled_at);
  const today = !followUp.is_completed && !overdue && isToday(followUp.scheduled_at);
  const done = followUp.is_completed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-start gap-3 rounded-xl px-4 py-3 transition-colors",
        done && "opacity-60"
      )}
      style={{
        background: overdue
          ? "rgba(239,68,68,0.06)"
          : today
            ? "rgba(245,158,11,0.06)"
            : "var(--card-bg)",
        border: overdue
          ? "1px solid rgba(239,68,68,0.2)"
          : today
            ? "1px solid rgba(245,158,11,0.2)"
            : "1px solid var(--card-border)",
      }}
    >
      {/* Status Indicator */}
      <div className="pt-0.5 flex-shrink-0">
        {done ? (
          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Check className="w-3 h-3 text-emerald-500" />
          </div>
        ) : overdue ? (
          <div className="relative w-5 h-5 flex items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </div>
        ) : today ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </div>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn("text-sm font-semibold truncate", done && "line-through")}
          style={{ color: "var(--foreground)" }}
        >
          {followUp.title}
        </p>
        {followUp.description && (
          <p
            className="text-xs mt-0.5 line-clamp-2"
            style={{ color: "var(--muted)" }}
          >
            {followUp.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span
            className={cn(
              "text-[11px] font-medium",
              overdue && "text-red-500",
              today && "text-amber-600 dark:text-amber-400"
            )}
            style={!overdue && !today ? { color: "var(--muted)" } : undefined}
          >
            {done && followUp.completed_at
              ? `Completed ${formatDate(followUp.completed_at)}`
              : formatDate(followUp.scheduled_at)}
          </span>
          {followUp.assigned_user?.display_name && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-md"
              style={{
                background: "var(--card-border)",
                color: "var(--muted)",
              }}
            >
              {followUp.assigned_user.display_name}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!done && onComplete && (
        <button
          onClick={onComplete}
          disabled={isCompleting}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50"
          title="Mark as complete"
        >
          <CheckCircle2
            className={cn(
              "w-4.5 h-4.5 text-emerald-500 transition-transform",
              isCompleting && "animate-spin"
            )}
          />
        </button>
      )}
    </motion.div>
  );
}
