"use client";

// On a phone the keyboard covers half the screen, so the guide's card steps
// aside while the merchant types in a field and comes back when they leave it.

import { useEffect, useState } from "react";

/** Below this width the guide treats the screen as a phone (same as useIsMobile). */
export const GUIDE_PHONE_MAX_WIDTH = 768;

/** Inputs that open no keyboard. */
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

export function opensKeyboard(el: EventTarget | null): boolean {
    if (el instanceof HTMLTextAreaElement) return !el.readOnly;
    if (el instanceof HTMLInputElement) return !el.readOnly && !NO_KEYBOARD.has(el.type);
    return el instanceof HTMLElement && el.isContentEditable === true;
}

function onPhone(): boolean {
    return window.innerWidth < GUIDE_PHONE_MAX_WIDTH;
}

export function usePhoneTyping(): boolean {
    // The card mounts in the browser only (it waits for the guide's data).
    const [typing, setTyping] = useState(() => typeof document !== "undefined" && onPhone() && opensKeyboard(document.activeElement));
    useEffect(() => {
        // focusin names the field gaining focus; focusout names the one taking
        // over (relatedTarget), or null when focus leaves every field.
        const onIn = (e: FocusEvent): void => setTyping(onPhone() && opensKeyboard(e.target));
        const onOut = (e: FocusEvent): void => setTyping(onPhone() && opensKeyboard(e.relatedTarget));
        document.addEventListener("focusin", onIn);
        document.addEventListener("focusout", onOut);
        return () => {
            document.removeEventListener("focusin", onIn);
            document.removeEventListener("focusout", onOut);
        };
    }, []);
    return typing;
}
