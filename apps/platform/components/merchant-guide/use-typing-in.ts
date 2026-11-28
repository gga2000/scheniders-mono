"use client";

// The first product walks itself: once a field is filled the light moves on.
// Counted at the first letter, that jumped away while the merchant was still
// typing (Ali, 28 Nov), so the field holding the typing cursor keeps the
// light until focus leaves it.

import { useCallback, useSyncExternalStore } from "react";
import { opensKeyboard } from "./use-phone-typing";

const KEY_SEPARATOR = "\n";

function subscribe(onChange: () => void): () => void {
    document.addEventListener("focusin", onChange);
    document.addEventListener("focusout", onChange);
    return () => {
        document.removeEventListener("focusin", onChange);
        document.removeEventListener("focusout", onChange);
    };
}

/** Which of `selectors` holds the field the merchant is typing in, or -1. */
export function useTypingIn(selectors: readonly string[] | null): number {
    const key = selectors && selectors.length > 0 ? selectors.join(KEY_SEPARATOR) : null;
    const read = useCallback((): number => {
        const el = document.activeElement;
        if (key === null || !opensKeyboard(el)) return -1;
        return key.split(KEY_SEPARATOR).findIndex((selector) => document.querySelector(selector)?.contains(el) ?? false);
    }, [key]);
    return useSyncExternalStore(subscribe, read, () => -1);
}
