// A grouped ("0780 230 1677") phone input that keeps the caret where the
// shopper is typing. Each edit is reformatted through applyPhoneEdit, and
// the caret is put back after the same digit on every commit — even when
// the reformatted value is unchanged (a typed letter or space), because
// React still rewrites the controlled value and the browser would leave
// the caret at the end. Used by both phone fields of the express form.

import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { applyPhoneEdit } from "./phone";

export interface PhoneInputBinding {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Ref callback for the <input>; merge it with any other ref. */
  bind: (el: HTMLInputElement | null) => void;
}

/** The InputEvent type of a change, when the browser reports one. */
function inputTypeOf(e: ChangeEvent<HTMLInputElement>): string | undefined {
  const native = e.nativeEvent;
  return "inputType" in native && typeof native.inputType === "string"
    ? native.inputType
    : undefined;
}

export function usePhoneInput(
  value: string,
  onValue: (formatted: string) => void,
): PhoneInputBinding {
  const el = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // Bumped on every edit so the caret restore runs after each commit, not
  // only when the formatted string changed.
  const [edits, setEdits] = useState(0);

  useLayoutEffect(() => {
    const input = el.current;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    if (input && caret !== null && document.activeElement === input) {
      input.setSelectionRange(caret, caret);
    }
  }, [edits]);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const next = applyPhoneEdit(value, raw, caret, inputTypeOf(e));
    pendingCaret.current = next.caret;
    setEdits((n) => n + 1);
    onValue(next.value);
  }

  function bind(input: HTMLInputElement | null) {
    el.current = input;
  }

  return { onChange, bind };
}
