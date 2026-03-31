"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, Check, X, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerNote } from "@/types/customer";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface CustomerNotesTabProps {
  notes: CustomerNote[];
  isLoading?: boolean;
  onAdd: (note: string) => Promise<void>;
  onUpdate: (id: string, note: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function NoteCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: CustomerNote;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim() || text === note.note) { setEditing(false); return; }
    setSaving(true);
    await onUpdate(note.id, text.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="group pastel-card p-4"
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-2xl border border-(--card-border) bg-background p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-(--pastel-blue) transition-all"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setText(note.note); }}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-muted hover:bg-background transition-colors"
            >
              <X className="h-3 w-3" /> إلغاء
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 rounded-xl bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Check className="h-3 w-3" /> حفظ
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{note.note}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-muted">
              {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ar })}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-xl text-muted hover:text-foreground hover:bg-background transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="p-1.5 rounded-xl text-muted hover:text-rose-700 hover:bg-(--pastel-pink)/30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

export function CustomerNotesTab({ notes, isLoading, onAdd, onUpdate, onDelete }: CustomerNotesTabProps) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitNote() {
    if (!newText.trim()) return;
    setSaving(true);
    await onAdd(newText.trim());
    setNewText("");
    setSaving(false);
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add note button / form */}
      <AnimatePresence mode="wait">
        {adding ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-3xl border border-(--card-border) bg-(--card-bg) p-4 space-y-3"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="اكتب ملاحظتك هنا..."
              className="w-full resize-none rounded-2xl border border-(--card-border) bg-background p-3 text-sm text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-(--pastel-blue) transition-all"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setAdding(false); setNewText(""); }}
                className="flex items-center gap-1 rounded-2xl px-3 py-1.5 text-xs text-muted hover:bg-background transition-all"
              >
                <X className="h-3 w-3" /> إلغاء
              </button>
              <button
                onClick={submitNote}
                disabled={saving || !newText.trim()}
                className="flex items-center gap-1.5 rounded-2xl bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-40 transition-all"
              >
                <Check className="h-3 w-3" />
                {saving ? "جاري الحفظ..." : "حفظ الملاحظة"}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setAdding(true)}
            className="flex items-center justify-center gap-2 rounded-3xl border border-dashed border-(--card-border) bg-(--card-bg) py-3 text-sm font-medium text-muted transition-all hover:border-(--border-hover) hover:text-foreground hover:bg-background"
          >
            <Plus className="h-4 w-4" />
            إضافة ملاحظة جديدة
          </motion.button>
        )}
      </AnimatePresence>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-3xl border border-(--card-border) bg-(--card-bg) p-4 animate-pulse">
              <div className="space-y-2">
                <div className="h-3 w-3/4 rounded bg-background" />
                <div className="h-3 w-1/2 rounded bg-background" />
              </div>
            </div>
          ))}
        </div>
      ) : notes.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <StickyNote className="h-10 w-10 text-muted" />
          <p className="text-sm text-muted">لا توجد ملاحظات بعد</p>
          <p className="text-xs text-muted">أضف ملاحظة لتتبع المعلومات المهمة</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
