// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOrderDraft,
  mergeDraftForm,
  orderDraftKey,
  readOrderDraft,
  writeOrderDraft,
} from "./order-draft";
import type { FormState } from "../pdp_direct_order.client";

const TENANT = "77777777-7777-4777-8777-777777777777";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const OTHER_PRODUCT = "33333333-3333-4333-8333-333333333333";

const EMPTY: FormState = {
  customer_name: "",
  phone: "",
  alt_phone: "",
  governorate_code: "",
  address_details: "",
};
const FILLED: FormState = {
  customer_name: "زبون تجريبي",
  phone: "07802301677",
  alt_phone: "",
  governorate_code: "BG",
  address_details: "الكرادة",
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("order draft", () => {
  it("round-trips the form and the in-flight keys", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: "key-0001", purchaseEventId: "evt-0001" });
    expect(readOrderDraft(TENANT, PRODUCT)).toEqual({
      form: FILLED,
      idempotencyKey: "key-0001",
      purchaseEventId: "evt-0001",
    });
  });

  it("keeps one draft per product", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    expect(readOrderDraft(TENANT, OTHER_PRODUCT)).toBeNull();
  });

  it("lives in this tab's sessionStorage, never localStorage", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("is gone once cleared", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: "key-0001", purchaseEventId: null });
    clearOrderDraft(TENANT, PRODUCT);
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
  });

  it("drops an unknown governorate and anything that is not a string", () => {
    window.sessionStorage.setItem(
      orderDraftKey(TENANT, PRODUCT),
      JSON.stringify({
        form: { customer_name: 5, phone: "0780", governorate_code: "XX" },
        idempotencyKey: 7,
        purchaseEventId: "",
      }),
    );
    expect(readOrderDraft(TENANT, PRODUCT)).toEqual({
      form: { ...EMPTY, phone: "0780" },
      idempotencyKey: null,
      purchaseEventId: null,
    });
  });

  it("reads corrupt JSON as no draft", () => {
    window.sessionStorage.setItem(orderDraftKey(TENANT, PRODUCT), "{not json");
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
  });

  it("survives storage that throws (privacy modes)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() =>
      writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null }),
    ).not.toThrow();
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
    expect(() => clearOrderDraft(TENANT, PRODUCT)).not.toThrow();
  });

  it("mergeDraftForm: a non-empty draft field wins, an empty one keeps the current value", () => {
    expect(
      mergeDraftForm({ ...EMPTY, governorate_code: "BA" }, { ...EMPTY, phone: "07802301677" }),
    ).toEqual({ ...EMPTY, phone: "07802301677", governorate_code: "BA" });
  });
});
