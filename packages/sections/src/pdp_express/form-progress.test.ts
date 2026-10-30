import { describe, expect, it } from "vitest";
import type { FieldKey, FormState } from "../pdp_direct_order.client";
import { EXPRESS_SUBMIT_ID, expressFormStage, UNREGISTERED } from "../helpers/express-order-store";
import { formProgressReport } from "./form-progress";

const EMPTY: FormState = {
  customer_name: "",
  phone: "",
  alt_phone: "",
  governorate_code: "",
  address_details: "",
};

/** The shared validator's rules, enough for these cases. */
function fieldError(k: FieldKey, raw: string): string | null {
  const v = raw.trim();
  if (k === "alt_phone") return null;
  if (k === "governorate_code") return v === "BG" ? null : "required";
  if (k === "phone") return /^07\d{9}$/.test(v.replace(/\s/g, "")) ? null : "invalid";
  return v ? null : "required";
}

function report(
  form: Partial<FormState>,
  phoneComplete = true,
  locale: "ar" | "en" = "ar",
  variant: { needed: boolean; targetId: string | null } = { needed: false, targetId: null },
) {
  return formProgressReport({
    form: { ...EMPTY, ...form },
    fieldError,
    phoneComplete,
    fieldId: (k) => `f-${k}`,
    submitLabel: locale === "ar" ? "ثبّت طلبي" : "Place my order",
    variant: { ...variant, label: locale === "ar" ? "اختار الخيار" : "Choose an option" },
    locale,
  });
}

const stageOf = (r: ReturnType<typeof report>) =>
  expressFormStage({ ...UNREGISTERED, registered: true, owner: "form-1", ...r });

describe("formProgressReport", () => {
  it("untouched: every required field missing, the phone first", () => {
    const r = report({}, false);
    expect(r.missing).toEqual(["phone", "customer_name", "governorate_code", "address_details"]);
    expect(r.firstMissingId).toBe("f-phone");
    expect(r.firstMissingLabel).toBe("رقم الموبايل");
    expect(stageOf(r)).toBe("untouched");
  });

  it("partial: names the first missing field in the shopper's locale", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG" });
    expect(r.missing).toEqual(["address_details"]);
    expect(r.firstMissingId).toBe("f-address_details");
    expect(r.firstMissingLabel).toBe("المنطقة والشارع");
    expect(stageOf(r)).toBe("partial");
    expect(report({ phone: "0770 123 4567" }, true, "en").firstMissingLabel).toBe("Your name");
  });

  it("a phone the express check refuses is still missing, even when the shared one passes", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG", address_details: "المنصور" }, false);
    expect(r.missing).toEqual(["phone"]);
    expect(stageOf(r)).toBe("partial");
  });

  it("whitespace is empty; the backup number never counts", () => {
    expect(report({ customer_name: "  " }).missing).toContain("customer_name");
    expect(report({ alt_phone: "" }).missing).not.toContain("alt_phone");
  });

  it("complete: nothing missing, the submit's id and label", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG", address_details: "المنصور" });
    expect(r).toEqual({
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: EXPRESS_SUBMIT_ID,
      submitLabel: "ثبّت طلبي",
    });
    expect(stageOf(r)).toBe("complete");
  });

  describe("a product sold by variant with none chosen", () => {
    const FILLED = { phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG", address_details: "المنصور" };
    const pills = { needed: true, targetId: "direct-order-variants" };

    it("every field filled is still not complete: the option is missing, named by the variant prompt", () => {
      const r = report(FILLED, true, "ar", pills);
      expect(r.missing).toEqual(["variant"]);
      expect(r.firstMissingId).toBe("direct-order-variants");
      expect(r.firstMissingLabel).toBe("اختار الخيار");
      expect(stageOf(r)).toBe("partial");
    });

    it("the option comes first, as the submit asks for it first; the fields still count for untouched", () => {
      const r = report({}, false, "en", pills);
      expect(r.missing).toEqual(["variant", "phone", "customer_name", "governorate_code", "address_details"]);
      expect(r.firstMissingId).toBe("direct-order-variants");
      expect(r.firstMissingLabel).toBe("Choose an option");
      expect(stageOf(r)).toBe("untouched");
    });

    it("a picker section owns the choice: no id to go to, still missing", () => {
      const r = report(FILLED, true, "ar", { needed: true, targetId: null });
      expect(r.missing).toEqual(["variant"]);
      expect(r.firstMissingId).toBeNull();
      expect(r.firstMissingLabel).toBe("اختار الخيار");
    });

    it("once chosen, it is not reported", () => {
      expect(report(FILLED, true, "ar", { needed: false, targetId: "direct-order-variants" }).missing).toEqual([]);
    });
  });
});
