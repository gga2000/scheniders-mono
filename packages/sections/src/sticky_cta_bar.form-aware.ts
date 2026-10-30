// =====================================================================
// sticky_cta_bar — the form-aware primary (spec §1.8, F04)
// =====================================================================
// The bar reads the express form's progress (useExpressOrderStore) and
// picks one of four states:
//   none      — no express form for this product: the start label, and
//               today's scroll_to_form tap;
//   untouched — the start label («اطلب الآن»); the tap goes to the first
//               empty field (the phone) and focuses it;
//   partial   — «كمّل طلبك» over «باقي {field}»; the tap goes to that field;
//   complete  — the form's own submit label («ثبّت طلبي») over «معلوماتك
//               جاهزة»; the tap brings the receipt into view and focuses the
//               submit, so the buyer sees the total before one more tap.
// The bar NEVER submits (D6, confirmed by Ali 2026-10-29): a COD order
// sent without seeing the total is the order refused at the door.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import {
  expressFormStage,
  type ExpressFormProgress,
  type ExpressFormStage,
} from "./helpers/express-order-store";
import { whatsappDigits } from "./helpers/whatsapp";
import { ss } from "./sticky_cta_bar.strings";

export type StickyTarget =
  | { kind: "form" }
  | { kind: "field"; id: string }
  | { kind: "submit"; id: string };

export interface StickyPrimary {
  stage: ExpressFormStage;
  label: string;
  /** The small second line, or null. */
  sub: string | null;
  target: StickyTarget;
}

export function stickyPrimary(
  progress: ExpressFormProgress,
  startLabel: string,
  locale: LocaleCode,
): StickyPrimary {
  const stage = expressFormStage(progress);
  const field: StickyTarget = progress.firstMissingId
    ? { kind: "field", id: progress.firstMissingId }
    : { kind: "form" };
  switch (stage) {
    case "none":
      return { stage, label: startLabel, sub: null, target: { kind: "form" } };
    case "untouched":
      return { stage, label: startLabel, sub: null, target: field };
    case "partial":
      return {
        stage,
        label: ss("continueOrder", locale),
        sub: progress.firstMissingLabel
          ? ss("stillMissing", locale, { field: progress.firstMissingLabel })
          : null,
        target: field,
      };
    case "complete":
      return {
        stage,
        label: progress.submitLabel ?? startLabel,
        sub: ss("ready", locale),
        target: progress.submitId ? { kind: "submit", id: progress.submitId } : { kind: "form" },
      };
  }
}

/** `wa.me` for the store's number, with `message` prefilled when non-empty. */
export function stickyWhatsappHref(number: string | null, message: string): string | null {
  if (!number) return null;
  const base = `https://wa.me/${whatsappDigits(number)}`;
  const text = message.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * Carries out the tap. A field is scrolled to the middle of the screen and
 * focused; the complete state centres the receipt and focuses the submit.
 * When the target is gone or sits in a collapsed (inert) stage, `fallback`
 * runs instead — today's scroll to the form.
 */
export function handOffToForm(target: StickyTarget, fallback: () => void): void {
  if (target.kind === "field") {
    const field = document.getElementById(target.id);
    if (!(field instanceof HTMLElement) || field.closest("[inert]")) {
      fallback();
      return;
    }
    field.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    field.focus({ preventScroll: true });
    return;
  }
  if (target.kind === "submit") {
    const submit = document.getElementById(target.id);
    const receipt = submit?.closest("form")?.querySelector("[data-receipt]");
    if (!(submit instanceof HTMLButtonElement) || !(receipt instanceof HTMLElement)) {
      fallback();
      return;
    }
    receipt.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    submit.focus({ preventScroll: true });
    return;
  }
  fallback();
}
