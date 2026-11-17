import { describe, expect, it } from "vitest";
import {
  alreadyDecidedText,
  amountStillOwed,
  EMPTY_PAYMENT_DETAILS,
  lockedChip,
  paymentDetailsSchema,
  readPaymentDetails,
  receiptKind,
  topupDecisionSchema,
  topupWarnings,
} from "./topup-queue";

const TENANT = "33333333-3333-4333-8333-333333333333";
const OTHER = "55555555-5555-4555-8555-555555555555";

describe("amountStillOwed", () => {
  const billing = { locked: true, reason: "unpaid" as const, plan: "basic", price_iqd: 9000 };

  it("is the next payment minus the wallet for a locked shop", () => {
    expect(amountStillOwed({ billing, balance_iqd: 1200 })).toBe(7800);
  });

  it("is zero when the wallet already covers the plan", () => {
    expect(amountStillOwed({ billing, balance_iqd: 12000 })).toBe(0);
  });

  it("is zero for a shop that is not locked, whatever its wallet", () => {
    expect(amountStillOwed({ billing: { ...billing, locked: false, reason: null }, balance_iqd: -5000 })).toBe(0);
    expect(amountStillOwed({ billing: null, balance_iqd: 0 })).toBe(0);
  });
});

describe("lockedChip", () => {
  const billing = { locked: true, reason: "unpaid" as const, plan: "basic", price_iqd: 9000 };

  it("says what still opens a locked shop, or that this payment does", () => {
    expect(lockedChip({ billing, balance_iqd: 1200, tenant_status: "active" })).toBe("Locked, month unpaid · needs 7,800 IQD to open");
    expect(lockedChip({ billing: { ...billing, reason: "trial_ended" }, balance_iqd: 9000, tenant_status: "trial" })).toBe(
      "Locked, trial ended · this payment opens it",
    );
  });

  it("does not promise a paused shop opens with the money: it opens once the pause lifts", () => {
    expect(lockedChip({ billing, balance_iqd: 9000, tenant_status: "limited" })).toBe(
      "Locked, month unpaid · paused, opens once the pause lifts",
    );
  });

  it("is nothing for a shop that is not locked", () => {
    expect(lockedChip({ billing: { ...billing, locked: false, reason: null }, balance_iqd: 0, tenant_status: "limited" })).toBeNull();
    expect(lockedChip({ billing: null, balance_iqd: 0, tenant_status: "active" })).toBeNull();
  });
});

describe("topupWarnings", () => {
  it("says nothing when nothing stands out", () => {
    expect(topupWarnings({ tenant_id: TENANT, same_file: [], same_amount_recent: 0 })).toEqual([]);
  });

  it("names the other shop that sent the same receipt file and where its request stands", () => {
    expect(
      topupWarnings({
        tenant_id: TENANT,
        same_amount_recent: 0,
        same_file: [
          { id: OTHER, display_id: 100012, business_name: "Other", outcome: "approved", created_at: "2026-11-10T00:00:00Z" },
          { id: TENANT, display_id: null, business_name: null, outcome: null, created_at: "2026-11-11T00:00:00Z" },
        ],
      }),
    ).toEqual([
      "Same receipt file as a request from shop #100012 (approved)",
      "Same receipt file as a request from another shop (waiting)",
    ]);
  });

  it("counts other requests for the same amount, in plain words", () => {
    expect(topupWarnings({ tenant_id: TENANT, same_file: [], same_amount_recent: 1 })).toEqual([
      "1 other request for the same amount from this shop within 7 days",
    ]);
    expect(topupWarnings({ tenant_id: TENANT, same_file: [], same_amount_recent: 3 })).toEqual([
      "3 other requests for the same amount from this shop within 7 days",
    ]);
  });
});

describe("receiptKind", () => {
  it("reads a PDF by its extension, any case, and everything else as a photo", () => {
    expect(receiptKind("t/a.pdf")).toBe("pdf");
    expect(receiptKind("t/a.PDF")).toBe("pdf");
    expect(receiptKind("t/a.jpg")).toBe("image");
    expect(receiptKind("t/pdf.png")).toBe("image");
  });
});

describe("topupDecisionSchema", () => {
  it("takes an approval with or without the amount that arrived", () => {
    expect(topupDecisionSchema.parse({ approve: true })).toEqual({ approve: true });
    expect(topupDecisionSchema.parse({ approve: true, amount: 9000 })).toEqual({ approve: true, amount: 9000 });
  });

  it("needs a reason of 3 to 300 characters to refuse, and trims it", () => {
    expect(topupDecisionSchema.parse({ approve: false, reason: "  Wrong account " })).toEqual({
      approve: false,
      reason: "Wrong account",
    });
    expect(topupDecisionSchema.safeParse({ approve: false }).success).toBe(false);
    expect(topupDecisionSchema.safeParse({ approve: false, reason: "  no  " }).success).toBe(false);
    expect(topupDecisionSchema.safeParse({ approve: false, reason: "x".repeat(301) }).success).toBe(false);
  });

  it("keeps the amount whole and inside the database's limits", () => {
    for (const amount of [999, 10_000_001, 1000.5]) {
      expect(topupDecisionSchema.safeParse({ approve: true, amount }).success).toBe(false);
    }
  });
});

describe("payment details", () => {
  const filled = {
    qi_card: " 1234 5678 ",
    qi_card_name: "Fermi",
    zain_cash: "",
    support_whatsapp: "9647701234567",
    working_hours: "Sat–Thu, 10 am–6 pm",
    legal_name: "Fermi LLC",
  };

  it("trims what staff type", () => {
    expect(paymentDetailsSchema.parse(filled).qi_card).toBe("1234 5678");
  });

  it("keeps the support WhatsApp to digits so the shop's link opens", () => {
    expect(paymentDetailsSchema.safeParse({ ...filled, support_whatsapp: "+9647701234567" }).success).toBe(true);
    expect(paymentDetailsSchema.safeParse({ ...filled, support_whatsapp: "0770 123 4567" }).success).toBe(false);
    expect(paymentDetailsSchema.safeParse({ ...filled, support_whatsapp: "" }).success).toBe(true);
  });

  it("reads the stored setting leniently: missing or non-text fields are empty", () => {
    expect(readPaymentDetails(null)).toEqual(EMPTY_PAYMENT_DETAILS);
    expect(readPaymentDetails("text")).toEqual(EMPTY_PAYMENT_DETAILS);
    expect(readPaymentDetails({ qi_card: " 77 ", zain_cash: 123 })).toEqual({ ...EMPTY_PAYMENT_DETAILS, qi_card: "77" });
  });
});

describe("alreadyDecidedText", () => {
  it("says how the receipt was decided before this click", () => {
    expect(alreadyDecidedText({ error: "Request already decided", outcome: "approved" })).toBe(
      "This receipt was already approved, so your decision changed nothing.",
    );
    expect(alreadyDecidedText({ error: "Request already decided", outcome: "rejected" })).toBe(
      "This receipt was already refused, so your decision changed nothing.",
    );
  });

  it("still says it was decided when the answer does not say how", () => {
    expect(alreadyDecidedText(null)).toBe("This receipt was already decided, so your decision changed nothing.");
    expect(alreadyDecidedText({ outcome: "lost" })).toBe("This receipt was already decided, so your decision changed nothing.");
  });
});
