// What the express form tells a form-aware sticky bar (spec §1.8): what is
// still missing — the option of a product sold by variant, then required
// fields — where the first one is and what it is called, and the submit's
// id and label. The option comes first because the submit asks for it
// first (it focuses the option before any field error). Pure, so the bar's
// four states are tested without a DOM.

import type { LocaleCode } from "@scheniders/shared";
import type { FieldKey, FormState } from "../pdp_direct_order.client";
import {
  EXPRESS_REQUIRED_FIELDS,
  EXPRESS_SUBMIT_ID,
  type ExpressFormReport,
  type ExpressRequirement,
} from "../helpers/express-order-store";
import type { ExpressStringKey } from "./strings";
import { xs } from "./text";

/** Each field's visible label: «باقي {field}» names it the same way. */
const FIELD_LABEL: Record<FieldKey, ExpressStringKey> = {
  phone: "phoneLabel",
  customer_name: "nameLabel",
  governorate_code: "governorateLabel",
  address_details: "addressLabel",
  alt_phone: "altPhoneLabel",
};

export function formProgressReport(input: {
  form: FormState;
  /** The shared validator (`ExpressModel.fieldError`). */
  fieldError: (k: FieldKey, raw: string) => string | null;
  /** The express form's own, stricter phone check: 11 digits on a known
   *  operator. A number the express submit would refuse is still missing. */
  phoneComplete: boolean;
  fieldId: (k: FieldKey) => string;
  submitLabel: string;
  /** The option of a product sold by variant: still owed (`needed`), the
   *  prompt that names it («اختار الخيار»), and the id of the group the
   *  form renders for it — null when a picker section owns the choice. */
  variant: { needed: boolean; label: string; targetId: string | null };
  locale: LocaleCode;
}): ExpressFormReport {
  const fields = EXPRESS_REQUIRED_FIELDS.filter((k) => {
    const value = input.form[k];
    if (value.trim() === "" || input.fieldError(k, value) !== null) return true;
    return k === "phone" && !input.phoneComplete;
  });
  const missing: ExpressRequirement[] = input.variant.needed ? ["variant", ...fields] : fields;
  const first = missing[0];
  const submitLabel = input.submitLabel.trim();
  return {
    missing,
    firstMissingId:
      first === undefined ? null : first === "variant" ? input.variant.targetId : input.fieldId(first),
    firstMissingLabel:
      first === undefined
        ? null
        : first === "variant"
          ? input.variant.label
          : xs(FIELD_LABEL[first], input.locale),
    submitId: EXPRESS_SUBMIT_ID,
    submitLabel: submitLabel === "" ? null : submitLabel,
  };
}
