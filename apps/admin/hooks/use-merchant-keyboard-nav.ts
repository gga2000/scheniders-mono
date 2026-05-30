"use client";

import { useEffect, useCallback } from "react";
import { useAdminStore } from "@/store/use-admin-store";

interface UseMerchantKeyboardNavOptions {
  merchants: Array<{ id: string }>;
  onOpenDetail: (id: string) => void;
  onToggleShortcuts: () => void;
}

export function useMerchantKeyboardNav({
  merchants,
  onOpenDetail,
  onToggleShortcuts,
}: UseMerchantKeyboardNavOptions) {
  const {
    focusedIndex,
    setFocusedIndex,
    setActiveDetailId,
    clearSelection,
    toggleMerchantSelection,
    toggleStar,
  } = useAdminStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when user is typing in an input or textarea
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Also skip if the active element is contentEditable
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        // ── Navigation: j / ArrowDown — move focus down ──
        case "j":
        case "ArrowDown": {
          if (merchants.length === 0) break;
          e.preventDefault();
          const next =
            focusedIndex === null
              ? 0
              : Math.min(focusedIndex + 1, merchants.length - 1);
          setFocusedIndex(next);
          break;
        }

        // ── Navigation: k / ArrowUp — move focus up ──
        case "k":
        case "ArrowUp": {
          if (merchants.length === 0) break;
          e.preventDefault();
          const prev =
            focusedIndex === null
              ? 0
              : Math.max(focusedIndex - 1, 0);
          setFocusedIndex(prev);
          break;
        }

        // ── Navigation: Enter — open focused merchant detail ──
        case "Enter": {
          if (focusedIndex !== null && merchants[focusedIndex]) {
            e.preventDefault();
            onOpenDetail(merchants[focusedIndex].id);
          }
          break;
        }

        // ── Navigation: / — focus search input ──
        case "/": {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLElement>(
            "[data-merchant-search]"
          );
          searchInput?.focus();
          break;
        }

        // ── Escape — close panel/dialog, deselect all ──
        case "Escape": {
          e.preventDefault();
          setActiveDetailId(null);
          clearSelection();
          break;
        }

        // ── Selection: x — toggle selection on focused merchant ──
        case "x": {
          if (focusedIndex !== null && merchants[focusedIndex]) {
            e.preventDefault();
            toggleMerchantSelection(merchants[focusedIndex].id);
          }
          break;
        }

        // ── Actions: s — toggle star on focused merchant ──
        case "s": {
          if (focusedIndex !== null && merchants[focusedIndex]) {
            e.preventDefault();
            toggleStar(merchants[focusedIndex].id);
          }
          break;
        }

        // ── Help: ? — show keyboard shortcuts overlay ──
        case "?": {
          e.preventDefault();
          onToggleShortcuts();
          break;
        }

        default:
          break;
      }
    },
    [
      focusedIndex,
      merchants,
      setFocusedIndex,
      setActiveDetailId,
      clearSelection,
      toggleMerchantSelection,
      toggleStar,
      onOpenDetail,
      onToggleShortcuts,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
