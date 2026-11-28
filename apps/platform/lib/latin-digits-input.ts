import type { ChangeEvent } from "react";
import { toLatinDigits } from "@scheniders/shared";

/**
 * What a phone field holds, with Arabic (٠-٩) and Persian (۰-۹) digits written
 * as 0-9: many merchants' phone keyboards type Arabic digits, and every check
 * and every saved number after the field reads 0-9. The field is rewritten in
 * place with the caret kept where it was (each digit stays one character), so
 * React finds nothing to write back and the cursor does not jump to the end.
 */
export function latinDigitsValue(event: ChangeEvent<HTMLInputElement>): string {
    const input = event.target;
    const latin = toLatinDigits(input.value);
    if (latin !== input.value) {
        const { selectionStart, selectionEnd } = input;
        input.value = latin;
        if (selectionStart !== null && selectionEnd !== null) input.setSelectionRange(selectionStart, selectionEnd);
    }
    return latin;
}
