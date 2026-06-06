"use client";

import { useState, useEffect } from "react";
import type { LeadActivityType } from "@/types/leads";
import { useCreateActivity } from "@/hooks/use-lead-activities";
import { BottomSheet } from "./bottom-sheet";
import { cn } from "@/lib/utils";
import { StickyNote, Phone, MessageCircle, Calendar, Loader2 } from "lucide-react";

const TYPES: { type: LeadActivityType; label: string; icon: typeof StickyNote; color: string }[] = [
  { type: "note", label: "Note", icon: StickyNote, color: "#3B82F6" },
  { type: "call", label: "Call", icon: Phone, color: "#22C55E" },
  { type: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#22C55E" },
  { type: "meeting", label: "Meeting", icon: Calendar, color: "#F59E0B" },
];

interface QuickNoteSheetProps {
  leadId: string | null;
  leadName?: string;
  onClose: () => void;
}

export function QuickNoteSheet({ leadId, leadName, onClose }: QuickNoteSheetProps) {
  const [type, setType] = useState<LeadActivityType>("note");
  const [text, setText] = useState("");
  const createActivity = useCreateActivity();

  useEffect(() => { if (leadId) { setType("note"); setText(""); } }, [leadId]);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed || !leadId) return;
    const cfg = TYPES.find((t) => t.type === type);
    createActivity.mutate(
      { leadId, activity_type: type, title: `${cfg?.label ?? type} added`, description: trimmed },
      { onSuccess: () => onClose() },
    );
  };

  const footer = (
    <button
      type="button"
      onClick={save}
      disabled={!text.trim() || createActivity.isPending}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF8899] to-[#A78BFA] py-3.5 font-bold text-white disabled:opacity-50"
    >
      {createActivity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Add {TYPES.find((t) => t.type === type)?.label}
    </button>
  );

  return (
    <BottomSheet open={!!leadId} onOpenChange={(o) => !o && onClose()} title={leadName ? `Log on "${leadName}"` : "Add note"} footer={footer}>
      <div className="mb-3 flex flex-wrap gap-2 pt-1">
        {TYPES.map(({ type: t, label, icon: Icon, color }) => {
          const active = type === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                !active && "border border-[var(--card-border)] text-[var(--muted)]")}
              style={active ? { backgroundColor: color, color: "#fff" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          );
        })}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        placeholder={`Add a ${TYPES.find((t) => t.type === type)?.label.toLowerCase()}…`}
        className="w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)]"
      />
    </BottomSheet>
  );
}
