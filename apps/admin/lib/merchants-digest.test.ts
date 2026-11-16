import { describe, it, expect } from "vitest";
import { merchantsDigest } from "./merchants-digest";

/*
 * The banner above the Merchants list said "2 merchants need your attention"
 * for one shop: it added the reasons up, and that shop had two (trial ended,
 * wallet empty). Its wallet card was named "Critical balance", counted wallets
 * under 5,000 IQD, and opened the balance filter that shows wallets under
 * 10,000 IQD.
 */

const buckets = (over: Partial<Parameters<typeof merchantsDigest>[0]> = {}) => ({
  trials_today: 0,
  trials_expired: 0,
  suspended: 0,
  cancelled: 0,
  low_wallet: 0,
  attention: 0,
  ...over,
});

describe("merchantsDigest", () => {
  it("counts a shop with two reasons once", () => {
    // One shop: its trial has ended and its wallet is empty.
    const digest = merchantsDigest(buckets({ trials_expired: 1, low_wallet: 1, attention: 1 }));

    expect(digest.shops).toBe(1);
    expect(digest.cards.map((card) => [card.reason, card.count])).toEqual([
      ["trials_expired", 1],
      ["low_wallet", 1],
    ]);
  });

  it("counts a locked shop that has no card of its own", () => {
    // Paying, wallet full, month unpaid: on the list by the database's rule, with none of the four reasons.
    expect(merchantsDigest(buckets({ attention: 1 }))).toEqual({ shops: 1, cards: [] });
  });

  it("names the wallet line the card counts, and opens the list those shops are on", () => {
    const [card] = merchantsDigest(buckets({ low_wallet: 2, attention: 2 })).cards;

    // The money formatter puts a no-break space after "IQD".
    expect(card.label).toBe("Wallet under 5,000 IQD");
    expect(card.status).toBe("attention");
  });

  it("opens the suspended shops from the Suspended card, the attention list from the others", () => {
    const digest = merchantsDigest(buckets({ trials_today: 1, trials_expired: 2, suspended: 3, attention: 6 }));

    expect(digest.cards.map((card) => [card.label, card.count, card.status])).toEqual([
      ["Trial expired", 2, "attention"],
      ["Trial ends today", 1, "attention"],
      ["Suspended", 3, "suspended"],
    ]);
  });

  it("is empty when no shop needs attention", () => {
    expect(merchantsDigest(buckets())).toEqual({ shops: 0, cards: [] });
  });
});
