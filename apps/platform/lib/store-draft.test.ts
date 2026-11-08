import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { canonicalConfigJson, hasUnpublishedDraft } from "./store-draft";

describe("hasUnpublishedDraft", () => {
    it("is false without a draft", () => {
        expect(hasUnpublishedDraft(null, emptyStoreConfigV2())).toBe(false);
    });
    it("is true for a draft on a never-published store", () => {
        expect(hasUnpublishedDraft(emptyStoreConfigV2(), null)).toBe(true);
    });
    it("is false when the draft matches the live store", () => {
        expect(hasUnpublishedDraft(emptyStoreConfigV2(), emptyStoreConfigV2())).toBe(false);
    });
    it("is true when the draft differs", () => {
        const draft = { ...emptyStoreConfigV2(), default_locale: "en" as const };
        const live = { ...emptyStoreConfigV2(), default_locale: "ar" as const };
        expect(hasUnpublishedDraft(draft, live)).toBe(true);
    });
});

describe("sameStoreConfig", () => {
    it("treats an undone empty list as no change", () => {
        const live = emptyStoreConfigV2();
        const draft = { ...live, segments: [] } as typeof live;
        expect(hasUnpublishedDraft(draft, live)).toBe(false);
    });
    it("ignores key order", () => {
        expect(canonicalConfigJson({ a: 1, b: 2 })).toBe(canonicalConfigJson({ b: 2, a: 1 }));
    });
    it("still sees a removed list entry", () => {
        expect(canonicalConfigJson({ x: [1, 2] })).not.toBe(canonicalConfigJson({ x: [1] }));
    });
});
