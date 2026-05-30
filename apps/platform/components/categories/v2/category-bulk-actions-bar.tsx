"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  FolderInput,
  GitMerge,
  Copy,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

type LoadingAction =
  | null
  | "archive"
  | "restore"
  | "showNav"
  | "hideNav"
  | "move"
  | "merge"
  | "duplicate"
  | "delete";

interface CategoryBulkActionsBarProps {
  selectedCount: number;
  totalCount?: number;
  onArchive: () => Promise<void> | void;
  onRestore?: () => Promise<void> | void;
  onToggleNav: (show: boolean) => Promise<void> | void;
  onMove?: () => void;
  onMerge?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => Promise<void> | void;
  onClear: () => void;
  onUndo?: () => Promise<void> | void;
}

const UNDO_TIMEOUT = 8000;

export function CategoryBulkActionsBar({
  selectedCount,
  totalCount,
  onArchive,
  onRestore,
  onToggleNav,
  onMove,
  onMerge,
  onDuplicate,
  onDelete,
  onClear,
  onUndo,
}: CategoryBulkActionsBarProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [undoState, setUndoState] = useState<{ label: string; timeLeft: number } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startUndo = useCallback(
    (label: string) => {
      if (!onUndo) return;
      setUndoState({ label, timeLeft: UNDO_TIMEOUT });
      tickRef.current = setInterval(() => {
        setUndoState((s) =>
          s ? { ...s, timeLeft: Math.max(0, s.timeLeft - 100) } : null,
        );
      }, 100);
      timeoutRef.current = setTimeout(() => {
        setUndoState(null);
        if (tickRef.current) clearInterval(tickRef.current);
      }, UNDO_TIMEOUT);
    },
    [onUndo],
  );

  const wrap = useCallback(
    async (key: LoadingAction, fn?: () => Promise<void> | void, undoLabel?: string) => {
      if (!fn) return;
      setLoading(key);
      try {
        await fn();
        if (undoLabel) startUndo(undoLabel);
      } finally {
        setLoading(null);
      }
    },
    [startUndo],
  );

  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="bulk-bar"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)]"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl shadow-lg border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur">
          <div className="flex items-center gap-2 pr-2 border-r border-[var(--card-border)]">
            <span className="text-sm font-semibold">
              {selectedCount}
              {totalCount ? ` / ${totalCount}` : ""}
            </span>
            <span className="text-xs text-muted">
              {t("categories.bulk.selected") || "selected"}
            </span>
          </div>

          <BulkBtn
            icon={EyeOff}
            label={t("categories.bulk.hideNav") || "Hide from nav"}
            disabled={loading !== null}
            onClick={() =>
              wrap(
                "hideNav",
                () => onToggleNav(false),
                t("categories.bulk.undoHideNav") || "Hid from nav",
              )
            }
            loading={loading === "hideNav"}
          />
          <BulkBtn
            icon={Eye}
            label={t("categories.bulk.showNav") || "Show in nav"}
            disabled={loading !== null}
            onClick={() =>
              wrap(
                "showNav",
                () => onToggleNav(true),
                t("categories.bulk.undoShowNav") || "Shown in nav",
              )
            }
            loading={loading === "showNav"}
          />

          {onMove && (
            <BulkBtn
              icon={FolderInput}
              label={t("categories.bulk.move") || "Move"}
              disabled={loading !== null}
              onClick={() => onMove()}
            />
          )}
          {onMerge && selectedCount >= 2 && (
            <BulkBtn
              icon={GitMerge}
              label={t("categories.bulk.merge") || "Merge"}
              disabled={loading !== null}
              onClick={() => onMerge()}
            />
          )}
          {onDuplicate && (
            <BulkBtn
              icon={Copy}
              label={t("categories.bulk.duplicate") || "Duplicate"}
              disabled={loading !== null}
              onClick={() => onDuplicate()}
            />
          )}

          <BulkBtn
            icon={Archive}
            label={t("categories.bulk.archive") || "Archive"}
            disabled={loading !== null}
            onClick={() =>
              wrap(
                "archive",
                onArchive,
                t("categories.bulk.undoArchive") || "Archived",
              )
            }
            loading={loading === "archive"}
            tone="amber"
          />
          {onRestore && (
            <BulkBtn
              icon={ArchiveRestore}
              label={t("categories.bulk.restore") || "Restore"}
              disabled={loading !== null}
              onClick={() => wrap("restore", onRestore)}
              loading={loading === "restore"}
            />
          )}
          {onDelete && (
            <BulkBtn
              icon={Trash2}
              label={t("categories.bulk.delete") || "Delete"}
              disabled={loading !== null}
              onClick={() => wrap("delete", onDelete)}
              loading={loading === "delete"}
              tone="rose"
            />
          )}

          <div className="w-px h-6 bg-[var(--card-border)] mx-1" />
          <button
            type="button"
            onClick={onClear}
            className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {undoState && onUndo && (
            <motion.button
              key="undo"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              onClick={async () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                if (tickRef.current) clearInterval(tickRef.current);
                setUndoState(null);
                await onUndo();
              }}
              className="mt-2 mx-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--ink)] text-white text-xs font-medium shadow-md"
            >
              <Undo2 className="w-3.5 h-3.5" />
              {undoState.label}
              <span className="opacity-70">
                ({Math.ceil(undoState.timeLeft / 1000)}s)
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function BulkBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  loading,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "default" | "amber" | "rose";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
        "hover:bg-[var(--background)]",
        tone === "amber" && "text-amber-700",
        tone === "rose" && "text-rose-700",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
