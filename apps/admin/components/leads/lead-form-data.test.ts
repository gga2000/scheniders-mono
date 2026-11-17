import { describe, expect, it } from "vitest";
import type { LeadFormData } from "@/types/leads";
import { DEFAULT_FORM } from "./use-lead-form-controller";
import { leadFormChanges, listsAsOpened, normalizeLeadForm } from "./lead-form-data";

/*
 * Round 6: the lead edit form sent every field on save, so a colleague's
 * change made while it was open (a new owner, a priority, a phone) was
 * written back over with what the form had loaded. A save now sends only the
 * fields this person changed.
 */

const stored: LeadFormData = {
  ...DEFAULT_FORM,
  merchant_name: "Kut Perfumes ",
  handle: "@kutperfumes",
  email: "Owner@Example.com",
  page_phone: "+964 770 123 4567",
  phone_numbers: [{ title: " Sales ", number: "07701234568" }],
  address: "Main street",
  city: "Kut",
  governorate_code: "WA",
  branches: [{ name: "Old town", city: "Kut", address: "", phones: [{ title: "", number: "" }] }],
  priority: "medium",
  assigned_to: "6c2f5b0e-1111-4222-8333-944455556666",
  tags: ["perfume"],
};

describe("what a lead form save sends", () => {
  it("sends only the field this person changed, so a colleague's new owner and priority stay", () => {
    const saved = normalizeLeadForm({ ...stored, city: "Al-Kut" });
    expect(leadFormChanges(stored, saved)).toEqual({ city: "Al-Kut" });
  });

  it("sends nothing for fields kept as stored, however they were written", () => {
    // The handle's "@", the phone's +964 and spaces, the email's capitals and
    // the blank branch phone row are all tidied on save; untouched, none is sent.
    expect(leadFormChanges(stored, normalizeLeadForm(stored))).toEqual({});
  });

  it("sends the cleared phones with the switch when the page becomes direct messages only", () => {
    const saved = normalizeLeadForm({ ...stored, contact_via_dm: true });
    expect(leadFormChanges(stored, saved)).toEqual({ contact_via_dm: true, page_phone: "", phone_numbers: [] });
  });

  it("sends the cleared place and branches with the switch when the shop becomes online only", () => {
    const saved = normalizeLeadForm({ ...stored, is_online_only: true });
    expect(leadFormChanges(stored, saved)).toEqual({
      is_online_only: true,
      address: "",
      city: "",
      governorate_code: "",
      branches: [],
    });
  });

  it("sends a changed list whole", () => {
    const saved = normalizeLeadForm({ ...stored, tags: ["perfume", "vip"] });
    expect(leadFormChanges(stored, saved)).toEqual({ tags: ["perfume", "vip"] });
  });

  // Round 11: so the server can tell a colleague's change to the list from this one.
  it("sends each changed list with the copy it opened as, as stored", () => {
    const saved = normalizeLeadForm({ ...stored, tags: ["perfume", "vip"], phone_numbers: [] });
    const changes = leadFormChanges(stored, saved);
    expect(listsAsOpened(stored, changes)).toEqual({ tags: ["perfume"], phone_numbers: [{ title: " Sales ", number: "07701234568" }] });
    expect(listsAsOpened(stored, { priority: "high" })).toEqual({});
  });
});

describe("the saved shape of a lead form", () => {
  it("trims, drops the handle's @, lowers the email and writes phones one way", () => {
    expect(normalizeLeadForm(stored)).toMatchObject({
      merchant_name: "Kut Perfumes",
      handle: "kutperfumes",
      email: "owner@example.com",
      page_phone: "07701234567",
      phone_numbers: [{ title: "Sales", number: "07701234568" }],
      branches: [{ name: "Old town", city: "Kut", address: "", phones: [] }],
    });
  });
});
