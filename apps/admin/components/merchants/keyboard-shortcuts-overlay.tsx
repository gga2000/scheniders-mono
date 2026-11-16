"use client";

import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_CHROME } from "@/lib/animation-constants";

// ── Types ─────────────────────────────────────────────────────────────

interface KeyboardShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

// ── Shortcut Data ─────────────────────────────────────────────────────

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["j", "↓"], description: "Move down" },
      { keys: ["k", "↑"], description: "Move up" },
      { keys: ["Enter"], description: "Open detail" },
      { keys: ["/"], description: "Focus search" },
    ],
  },
  {
    title: "Selection",
    shortcuts: [
      { keys: ["x"], description: "Toggle select" },
      { keys: ["Shift", "Click"], description: "Range select" },
      { keys: ["Escape"], description: "Deselect all" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["s"], description: "Toggle star" },
      { keys: ["?"], description: "Show shortcuts" },
    ],
  },
  {
    title: "Views",
    shortcuts: [],
  },
];

// ── Key Badge Component ───────────────────────────────────────────────

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md bg-foreground/10 px-1.5 font-mono text-xs font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function KeyboardShortcutsOverlay({
  isOpen,
  onClose,
}: KeyboardShortcutsOverlayProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-dialog-title"
              className="w-full max-w-xl rounded-2xl border bg-[var(--card-bg)] border-[var(--card-border)] p-6 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_CHROME }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h2 id="shortcuts-dialog-title" className="text-lg font-semibold text-foreground">
                  Keyboard Shortcuts
                </h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4L4 12M4 4l8 8" />
                  </svg>
                </button>
              </div>

              {/* Shortcuts Grid */}
              <div className="grid grid-cols-2 gap-6">
                {SHORTCUT_CATEGORIES.map((category) => (
                  <div key={category.title}>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/50">
                      {category.title}
                    </h3>

                    {category.shortcuts.length === 0 ? (
                      <p className="text-sm text-foreground/40 italic">
                        No shortcuts yet
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {category.shortcuts.map((shortcut) => (
                          <li
                            key={shortcut.description}
                            className="flex items-center gap-2"
                          >
                            <span className="flex shrink-0 items-center gap-1">
                              {shortcut.keys.map((key, i) => (
                                <span key={key} className="flex items-center gap-1">
                                  {i > 0 && (
                                    <span className="text-xs text-foreground/30">
                                      /
                                    </span>
                                  )}
                                  <KeyBadge>{key}</KeyBadge>
                                </span>
                              ))}
                            </span>
                            <span className="text-sm text-foreground/70">
                              {shortcut.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-6 border-t border-[var(--card-border)] pt-4 text-center">
                <p className="text-xs text-foreground/40">
                  Press <KeyBadge>?</KeyBadge> to toggle this overlay
                </p>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
