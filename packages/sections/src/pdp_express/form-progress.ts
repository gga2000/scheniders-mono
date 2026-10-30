// What the express form tells a form-aware sticky bar (spec §1.8): which
// required fields are still missing, where the first one is and what it is
// called, and the submit's id and label. Pure, so the bar's four states are
// tested without a DOM.

import type { LocaleCode } from "@scheniders/shared";
import type { FieldKey, FormState } from "../pdp_direct_order.client";
import {
  EXPRESS_REQUIRED_FIELDS,
  EXPRESS_SUBMIT_ID,
  type ExpressFormReport,
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
  locale: LocaleCode;
}): ExpressFormReport {
  const missing = EXPRESS_REQUIRED_FIELDS.filter((k) => {
    const value = input.form[k];
    if (value.trim() === "" || input.fieldError(k, value) !== null) return true;
    return k === "phone" && !input.phoneComplete;
  });
  const first = missing[0];
  const submitLabel = input.submitLabel.trim();
  return {
    missing,
    firstMissingId: first ? input.fieldId(first) : null,
    firstMissingLabel: first ? xs(FIELD_LABEL[first], input.locale) : null,
    submitId: EXPRESS_SUBMIT_ID,
    submitLabel: submitLabel === "" ? null : submitLabel,
  };
}
