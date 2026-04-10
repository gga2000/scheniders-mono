"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LeadActivity, LeadActivityType } from "@/types/leads";
import { useCreateActivity } from "@/hooks/use-lead-activities";
import {
  StickyNote,
  Phone,
  MessageCircle,
  Mail,
  Calendar,
  ArrowRight,
  UserPlus,
  Store,
  Bell,
  Trophy,
  TrendingUp,
  Tag,
  Send,
  Loader2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// ── Activity Type Config ────────────────────────────────────────────────

const ACTIVITY_TYPE_CONFIG: Record<
  LeadActivityType,
  { icon: typeof StickyNote; color: string; bg: string }
> = {
  note: { icon: StickyNote, color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  call: { icon: Phone, color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  whatsapp: { icon: MessageCircle, color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  email: { icon: Mail, color: "#A855F7", bg: "rgba(168,85,247,0.12)" },
  meeting: { icon: Calendar, color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  status_change: { icon: ArrowRight, color: "#EAB308", bg: "rgba(234,179,8,0.12)" },
  assignment_change: { icon: UserPlus, color: "#06B6D4", bg: "rgba(6,182,212,0.12)" },
  store_created: { icon: Store, color: "#A855F7", bg: "rgba(168,85,247,0.12)" },
  follow_up: { icon: Bell, color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  conversion: { icon: Trophy, color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  score_change: { icon: TrendingUp, color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  tag_change: { icon: Tag, color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
};

const QUICK_ADD_TYPES: { type: LeadActivityType; label: string }[] = [
  { type: "note", label: "Note" },
  { type: "call", label: "Call" },
  { type: "whatsapp", label: "WhatsApp" },
  { type: "email", label: "Email" },
  { type: "meeting", label: "Meeting" },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

// ── Component ───────────────────────────────────────────────────────────

interface LeadActivityTimelineProps {
  activities: LeadActivity[];
  leadId: string;
}

export function LeadActivityTimeline({ activities, leadId }: LeadActivityTimelineProps) {
  const [selectedType, setSelectedType] = useState<LeadActivityType>("note");
  const [description, setDescription] = useState("");
  const createActivity = useCreateActivity();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return;

    const config = QUICK_ADD_TYPES.find((t) => t.type === selectedType);
    createActivity.mutate(
      {
        leadId,
        activity_type: selectedType,
        title: `${config?.label ?? selectedType} added`,
        description: trimmed,
      },
      {
        onSuccess: () => setDescription(""),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Quick Add Form ──────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
      >
        {/* Type tabs */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {QUICK_ADD_TYPES.map(({ type, label }) => {
            const cfg = ACTIVITY_TYPE_CONFIG[type];
            const Icon = cfg.icon;
            const isActive = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  isActive
                    ? "text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]",
                )}
                style={isActive ? { backgroundColor: cfg.color } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`Add a ${QUICK_ADD_TYPES.find((t) => t.type === selectedType)?.label.toLowerCase() ?? "note"}...`}
            className="flex-1 rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)] transition-colors"
          />
          <button
            type="submit"
            disabled={!description.trim() || createActivity.isPending}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              "bg-[var(--primary)] text-[var(--primary-fg)]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "hover:opacity-90",
            )}
          >
            {createActivity.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Add
          </button>
        </div>
      </form>

      {/* ── Timeline ────────────────────────────────────── */}
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
          <StickyNote className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[17px] top-2 bottom-2 w-px bg-[var(--card-border)]" />

          <AnimatePresence initial={false}>
            {activities.map((activity, idx) => {
              const cfg = ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? ACTIVITY_TYPE_CONFIG.note;
              const Icon = cfg.icon;
              const isLast = idx === activities.length - 1;

              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  className={cn("relative flex gap-3 group", !isLast && "pb-4")}
                >
                  {/* Icon circle */}
                  <div
                    className="relative z-10 flex-shrink-0 w-[35px] h-[35px] rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  {/* Content card */}
                  <div className="flex-1 min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 transition-colors hover:border-[color-mix(in_srgb,var(--card-border),var(--foreground)_10%)]">
                    {/* Title */}
                    <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">
                      {activity.title}
                    </p>

                    {/* Description */}
                    {activity.description && (
                      <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">
                        {activity.description}
                      </p>
                    )}

                    {/* Metadata display */}
                    {activity.activity_type === "status_change" &&
                      activity.metadata?.from &&
                      activity.metadata?.to && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="rounded px-1.5 py-0.5 bg-black/[0.05] dark:bg-white/[0.05] text-[var(--muted)] font-medium">
                            {String(activity.metadata.from)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[var(--muted)]" />
                          <span className="rounded px-1.5 py-0.5 bg-black/[0.05] dark:bg-white/[0.05] text-[var(--foreground)] font-medium">
                            {String(activity.metadata.to)}
                          </span>
                        </div>
                      )}

                    {activity.activity_type === "score_change" &&
                      activity.metadata?.old_score != null &&
                      activity.metadata?.new_score != null && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-[var(--muted)] font-medium">
                            {String(activity.metadata.old_score)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[var(--muted)]" />
                          <span
                            className="font-bold"
                            style={{
                              color:
                                Number(activity.metadata.new_score) >
                                Number(activity.metadata.old_score)
                                  ? "#22C55E"
                                  : "#EF4444",
                            }}
                          >
                            {String(activity.metadata.new_score)}
                          </span>
                        </div>
                      )}

                    {/* Footer: time + user */}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span>{timeAgo(activity.created_at)}</span>
                      {activity.created_by_user && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>
                            {activity.created_by_user.display_name ??
                              activity.created_by_user.email}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
