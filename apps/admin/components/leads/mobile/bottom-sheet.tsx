"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  /** Full height (≈92vh) for big forms; otherwise auto height capped at 88vh. */
  fullHeight?: boolean;
  children: React.ReactNode;
  /** Optional sticky footer (e.g. action buttons). */
  footer?: React.ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, fullHeight, children, footer }: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lead-overlay-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-[var(--card-border)]",
            "bg-[var(--background)] shadow-2xl lead-sheet-in outline-none",
            fullHeight ? "h-[92vh]" : "max-h-[88vh]",
          )}
        >
          {/* drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <span className="h-1.5 w-10 rounded-full bg-[var(--card-border)]" />
          </div>
          {title && (
            <Dialog.Title className="px-5 pb-3 pt-1 text-base font-bold text-[var(--foreground)] shrink-0">
              {title}
            </Dialog.Title>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--card-bg)]/60 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
