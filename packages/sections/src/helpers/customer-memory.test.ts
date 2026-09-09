// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  CUSTOMER_MEMORY_TTL_MS,
  clearCustomerMemory,
  prefillFromMemory,
  readCustomerMemory,
  writeCustomerMemory,
} from "./customer-memory";

const T = "11111111-1111-4111-8111-111111111111";
const rec = {
  customer_name: "علي",
  phone: "7701234567",
  governorate_code: "BG",
  address_details: "الكرادة، شارع 62",
};

beforeEach(() => window.localStorage.clear());

describe("customer memory", () => {
  it("round-trips the shopper's details for the tenant that wrote them", () => {
    writeCustomerMemory(T, rec, 1_000);
    expect(readCustomerMemory(T, 2_000)).toEqual({ ...rec, alt_phone: undefined, city: undefined, saved_at: 1_000 });
    expect(readCustomerMemory("22222222-2222-4222-8222-222222222222", 2_000)).toBeNull();
  });

  it("forgets a record older than the TTL, or one without a phone", () => {
    writeCustomerMemory(T, rec, 0);
    expect(readCustomerMemory(T, CUSTOMER_MEMORY_TTL_MS + 1)).toBeNull();
    window.localStorage.setItem(`schn:customer:${T}`, JSON.stringify({ ...rec, phone: "", saved_at: 5 }));
    expect(readCustomerMemory(T, 10)).toBeNull();
  });

  it("survives garbage in storage", () => {
    window.localStorage.setItem(`schn:customer:${T}`, "{not json");
    expect(readCustomerMemory(T)).toBeNull();
    window.localStorage.setItem(`schn:customer:${T}`, "42");
    expect(readCustomerMemory(T)).toBeNull();
  });

  it("clear removes only this tenant's record", () => {
    writeCustomerMemory(T, rec);
    writeCustomerMemory("22222222-2222-4222-8222-222222222222", rec);
    clearCustomerMemory(T);
    expect(readCustomerMemory(T)).toBeNull();
    expect(readCustomerMemory("22222222-2222-4222-8222-222222222222")).not.toBeNull();
  });

  it("prefill fills blanks only and never overwrites what the shopper typed", () => {
    const memory = { ...rec, alt_phone: "7809876543", saved_at: 1 };
    const form = { customer_name: "", phone: "", alt_phone: "", governorate_code: "NI", address_details: "" };
    const { next, filled } = prefillFromMemory(form, memory);
    expect(filled).toBe(true);
    expect(next).toEqual({ customer_name: "علي", phone: "7701234567", alt_phone: "7809876543", governorate_code: "NI", address_details: "الكرادة، شارع 62" });
    // A form with no matching blank fields reports nothing filled.
    expect(prefillFromMemory({ notes: "" }, memory).filled).toBe(false);
  });
});
