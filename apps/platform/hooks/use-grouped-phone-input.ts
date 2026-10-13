"use client";

import { useLayoutEffect, useRef, type ChangeEvent } from "react";
import { formatPhoneInput, unformatPhoneInput } from "@/lib/order-utils";

/** Index in `display` just after the `nonSpaceCount`-th non-whitespace character. */
function caretAfterNonSpace(display: string, nonSpaceCount: number): number {
    if (nonSpaceCount <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < display.length; i++) {
        if (!/\s/.test(display[i])) {
            seen++;
            if (seen === nonSpaceCount) return i + 1;
        }
    }
    return display.length;
}

/**
 * Wires a phone <input> to show 4-3-4 grouping ("0780 230 1677") while form state
 * keeps the un-spaced value. Spread the result onto the input:
 *   const phoneInput = useGroupedPhoneInput(value, setValue);
 *   <input {...phoneInput} />
 * The caret is re-anchored by digit count so editing mid-number doesn't jump to the end.
 */
export function useGroupedPhoneInput(raw: string, onRawChange: (value: string) => void) {
    const ref = useRef<HTMLInputElement>(null);
    const pendingCaret = useRef<number | null>(null);
    const value = formatPhoneInput(raw);

    useLayoutEffect(() => {
        const el = ref.current;
        const nonSpace = pendingCaret.current;
        pendingCaret.current = null;
        if (!el || nonSpace === null || document.activeElement !== el) return;
        const pos = caretAfterNonSpace(el.value, nonSpace);
        el.setSelectionRange(pos, pos);
    });

    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
        const target = e.target;
        const caret = target.selectionStart ?? target.value.length;
        pendingCaret.current = unformatPhoneInput(target.value.slice(0, caret)).length;
        onRawChange(unformatPhoneInput(target.value));
    };

    return { ref, value, onChange };
}
