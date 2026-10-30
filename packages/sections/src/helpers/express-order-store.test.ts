import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPRESS_REQUIRED_FIELDS,
  EXPRESS_SUBMIT_ID,
  UNREGISTERED,
  expressFormOf,
  expressFormStage,
  useExpressOrderStore,
  type ExpressFormReport,
} from "./express-order-store";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const store = () => useExpressOrderStore.getState();

beforeEach(() => useExpressOrderStore.setState({ forms: {}, watchers: {} }));

describe("EXPRESS_REQUIRED_FIELDS", () => {
  it("is the express field order without the backup number", () => {
    expect(EXPRESS_REQUIRED_FIELDS).toEqual([
      "phone",
      "customer_name",
      "governorate_code",
      "address_details",
    ]);
  });
});

describe("useExpressOrderStore", () => {
  it("reads UNREGISTERED, the same object every time, for a product with no form", () => {
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
    expect(expressFormOf(store(), P1)).toBe(expressFormOf(store(), P1));
    expect(expressFormStage(UNREGISTERED)).toBe("none");
  });

  it("registers a form as untouched, with every required field missing", () => {
    store().registerForm(P1, "direct-order");
    const form = expressFormOf(store(), P1);
    expect(form.registered).toBe(true);
    expect(form.formId).toBe("direct-order");
    expect(form.missing).toEqual(EXPRESS_REQUIRED_FIELDS);
    expect(expressFormStage(form)).toBe("untouched");
  });

  it("moves to partial, then complete, as the form reports", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, {
      missing: ["governorate_code", "address_details"],
      firstMissingId: "direct-order-governorate_code",
      firstMissingLabel: "المحافظة",
      submitId: "direct-order-submit",
      submitLabel: "ثبّت طلبي",
    });
    const partial = expressFormOf(store(), P1);
    expect(expressFormStage(partial)).toBe("partial");
    expect(partial.firstMissingLabel).toBe("المحافظة");
    expect(partial.submitId).toBe("direct-order-submit");

    store().reportForm(P1, {
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: "direct-order-submit",
      submitLabel: "ثبّت طلبي",
    });
    expect(expressFormStage(expressFormOf(store(), P1))).toBe("complete");
  });

  it("ignores a report from a form that is not registered", () => {
    store().reportForm(P1, {
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: "x",
      submitLabel: null,
    });
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
  });

  it("keeps products apart", () => {
    store().registerForm(P1, "form-1");
    expect(expressFormOf(store(), P2)).toBe(UNREGISTERED);
  });

  it("unregisters on cleanup, but never removes a newer form's entry", () => {
    const first = store().registerForm(P1, "form-a");
    store().registerForm(P1, "form-b");
    first();
    expect(expressFormOf(store(), P1).formId).toBe("form-b");
    const second = store().registerForm(P1, "form-c");
    second();
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
  });
});

describe("slice 1f: the submit label, quiet reports, and watching bars", () => {
  const report: ExpressFormReport = {
    missing: ["address_details"],
    firstMissingId: "f-address_details",
    firstMissingLabel: "المنطقة والشارع",
    submitId: EXPRESS_SUBMIT_ID,
    submitLabel: "ثبّت طلبي",
  };

  it("the submit id is the express form's id plus -submit", () => {
    expect(EXPRESS_SUBMIT_ID).toBe("direct-order-submit");
    expect(UNREGISTERED.submitLabel).toBeNull();
  });

  it("carries the submit label", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, report);
    expect(expressFormOf(store(), P1).submitLabel).toBe("ثبّت طلبي");
  });

  it("an unchanged report does not notify readers", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, report);
    let calls = 0;
    const unsubscribe = useExpressOrderStore.subscribe(() => {
      calls += 1;
    });
    store().reportForm(P1, report);
    expect(calls).toBe(0);
    store().reportForm(P1, { ...report, missing: [], firstMissingId: null, firstMissingLabel: null });
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("counts watching bars; only the last cleanup unwatches", () => {
    const watched = () => (store().watchers[P1] ?? 0) > 0;
    expect(watched()).toBe(false);
    const a = store().watchForm(P1);
    const b = store().watchForm(P1);
    a();
    expect(watched()).toBe(true);
    b();
    expect(watched()).toBe(false);
    expect(store().watchers).toEqual({});
  });
});
