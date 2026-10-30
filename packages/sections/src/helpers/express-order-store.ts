// =====================================================================
// express-order-store — how far the shopper is through the express form
// =====================================================================
// The express form (inside pdp_direct_order) and the smart sticky bar are
// separate sections; neither can pass props to the other. This store is
// the wire, like `variant-store`: the form writes its progress while it is
// mounted, the bar reads it to pick its label and its tap target. Keyed by
// product id, not persisted — progress belongs to this page view.
//
// Phase 1 carries only `form`; Phase 4a adds `addons` beside it. It is read
// only by sections that opted in (`primary_kind: "form_aware"`, slice 1f).
// With nothing registered every reader sees `UNREGISTERED` and keeps
// today's behaviour.
//
// The wire runs both ways for one thing: a form-aware bar WATCHES the
// product (`watchForm`), and only while it is watched does the form mark
// its receipt (`data-receipt`) and give its submit the id the bar focuses
// (`EXPRESS_SUBMIT_ID`). Server markup never carries either (effects do not
// run there), so every store without a form-aware bar renders as before.
// =====================================================================

import { create } from "zustand";
import type { FieldKey } from "../pdp_direct_order.client";
import { EXPRESS_FIELD_ORDER } from "../pdp_express/model";

/** The id the express submit carries while a form-aware bar watches. */
export const EXPRESS_SUBMIT_ID = "direct-order-submit";

/** The id the express form's option pills carry while a bar watches. */
export const EXPRESS_VARIANTS_ID = "direct-order-variants";

/** What can still stand between the shopper and the order: a required
 *  field, or — for a product sold by variant — the option itself. */
export type ExpressRequirement = FieldKey | "variant";

/** The fields a shopper must fill before the order can go: the express
 *  field order without the optional backup number. */
export const EXPRESS_REQUIRED_FIELDS: readonly FieldKey[] = EXPRESS_FIELD_ORDER.filter(
  (k) => k !== "alt_phone",
);

export interface ExpressFormProgress {
  /** True while an express form for this product is mounted. */
  registered: boolean;
  /** What is still owed, in the order the submit asks for it: the option
   *  first (unchosen variant), then required fields that are empty or
   *  invalid, in express field order. */
  missing: readonly ExpressRequirement[];
  /** DOM id of the first missing thing — a field, or the option group the
   *  form owns — or null when none is missing or it has no id here (the
   *  option is chosen in a separate picker section). */
  firstMissingId: string | null;
  /** Its label in the current locale, or null. */
  firstMissingLabel: string | null;
  /** DOM id of the form's submit button, once it has one. */
  submitId: string | null;
  /** The submit's label in the current locale («ثبّت طلبي»), or null. */
  submitLabel: string | null;
  /** The registering mount's own token ("" when nothing is registered),
   *  so one form's unmount never removes another's entry. */
  owner: string;
}

/** What the form reports on every change. */
export type ExpressFormReport = Pick<
  ExpressFormProgress,
  "missing" | "firstMissingId" | "firstMissingLabel" | "submitId" | "submitLabel"
>;

/** The one value readers see for a product with no mounted form. A single
 *  frozen object, so a selector returning it never re-renders a reader. */
export const UNREGISTERED: ExpressFormProgress = Object.freeze({
  registered: false,
  missing: EXPRESS_REQUIRED_FIELDS,
  firstMissingId: null,
  firstMissingLabel: null,
  submitId: null,
  submitLabel: null,
  owner: "",
});

/** True when `report` would change nothing in `current`. */
function sameReport(current: ExpressFormProgress, report: ExpressFormReport): boolean {
  return (
    current.missing.join(" ") === report.missing.join(" ") &&
    current.firstMissingId === report.firstMissingId &&
    current.firstMissingLabel === report.firstMissingLabel &&
    current.submitId === report.submitId &&
    current.submitLabel === report.submitLabel
  );
}

interface ExpressOrderState {
  forms: Record<string, ExpressFormProgress>;
  /** How many form-aware bars watch each product's form. */
  watchers: Record<string, number>;
  /** Called by the form on mount with a token unique to that mount
   *  (`useId`); returns the unmount cleanup. */
  registerForm: (productId: string, owner: string) => () => void;
  /** Called by the form after every render. Ignored while not registered,
   *  and a no-op (readers are not notified) when nothing changed. */
  reportForm: (productId: string, report: ExpressFormReport) => void;
  /** Called by a form-aware bar on mount; returns the unmount cleanup. */
  watchForm: (productId: string) => () => void;
}

export const useExpressOrderStore = create<ExpressOrderState>()((set) => ({
  forms: {},
  watchers: {},
  registerForm: (productId, owner) => {
    set((s) => ({
      forms: {
        ...s.forms,
        [productId]: { ...UNREGISTERED, registered: true, owner },
      },
    }));
    return () =>
      set((s) => {
        // A newer form for the same product may have registered since;
        // only this form's own entry is removed.
        if (s.forms[productId]?.owner !== owner) return s;
        return {
          forms: Object.fromEntries(
            Object.entries(s.forms).filter(([id]) => id !== productId),
          ),
        };
      });
  },
  reportForm: (productId, report) =>
    set((s) => {
      const current = s.forms[productId];
      if (!current || sameReport(current, report)) return s;
      return { forms: { ...s.forms, [productId]: { ...current, ...report } } };
    }),
  watchForm: (productId) => {
    set((s) => ({ watchers: { ...s.watchers, [productId]: (s.watchers[productId] ?? 0) + 1 } }));
    return () =>
      set((s) => {
        const left = (s.watchers[productId] ?? 0) - 1;
        if (left > 0) return { watchers: { ...s.watchers, [productId]: left } };
        return {
          watchers: Object.fromEntries(Object.entries(s.watchers).filter(([id]) => id !== productId)),
        };
      });
  },
}));

/** The progress for `productId`, or `UNREGISTERED`. */
export function expressFormOf(
  state: Pick<ExpressOrderState, "forms">,
  productId: string,
): ExpressFormProgress {
  return state.forms[productId] ?? UNREGISTERED;
}

/** Hook form of `expressFormOf`, for the sections that read it. */
export function useExpressFormProgress(productId: string): ExpressFormProgress {
  return useExpressOrderStore((s) => expressFormOf(s, productId));
}

/** True while at least one form-aware bar watches `productId`'s form. */
export function useFormWatched(productId: string): boolean {
  return useExpressOrderStore((s) => (s.watchers[productId] ?? 0) > 0);
}

export type ExpressFormStage = "none" | "untouched" | "partial" | "complete";

/**
 * The four states the smart sticky bar renders (spec §1.8):
 *   none      — no express form is mounted for the product;
 *   untouched — every required field is still missing (an unchosen
 *               option, owed or not, does not make it partial);
 *   partial   — some, not all, are missing, or only the option is;
 *   complete  — nothing is missing, the option included.
 */
export function expressFormStage(progress: ExpressFormProgress): ExpressFormStage {
  if (!progress.registered) return "none";
  if (progress.missing.length === 0) return "complete";
  const allMissing = EXPRESS_REQUIRED_FIELDS.every((k) => progress.missing.includes(k));
  return allMissing ? "untouched" : "partial";
}
