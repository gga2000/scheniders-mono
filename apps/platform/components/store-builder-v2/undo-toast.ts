// =====================================================================
// showUndoToast — the one "removed, bring it back" toast of the editor
// =====================================================================
// Every list in the settings screens (bundles, discount codes, menu
// links, redirects) removes a row in one click and offers this toast,
// so no screen deletes silently. Restoring closes the toast at once:
// a toast still offering a restore that already happened would mislead.
// =====================================================================

import { dismissToast, toast } from "@/hooks/use-toast";

export const UNDO_TOAST_MS = 5000;

export interface UndoToastOptions {
    title: string;
    hint: string;
    restoreLabel: string;
    onRestore: () => void;
}

export function showUndoToast({ title, hint, restoreLabel, onRestore }: UndoToastOptions): void {
    const id: string = toast({
        title,
        description: hint,
        duration: UNDO_TOAST_MS,
        action: {
            label: restoreLabel,
            onClick: () => {
                onRestore();
                dismissToast(id);
            },
        },
    });
}

/** Removes row `index` through `set`, and offers to put it back in place. */
export function removeWithUndo<T>(
    rows: readonly T[],
    index: number,
    set: (next: T[]) => void,
    copy: Omit<UndoToastOptions, "onRestore">,
): void {
    const removed = rows[index];
    const next = rows.filter((_, i) => i !== index);
    set(next);
    showUndoToast({
        ...copy,
        onRestore: () => {
            const restored = [...next];
            restored.splice(index, 0, removed);
            set(restored);
        },
    });
}
