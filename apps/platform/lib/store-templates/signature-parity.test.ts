// Scheniders' own published store, pinned.
//
// This snapshot was taken before the direction/pack split (W6.1) and proved
// that refactor reproduced the merchant's config byte for byte. It now guards
// the same config against accidental drift: any diff here must come with a
// deliberate bump of the direction's `version`, which is what tells every
// store already on this direction that an update exists.
import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { applyStoreTemplate } from "./index";
import { schenidersSignatureTemplate } from "./scheniders-signature";

function normalise(v: unknown): unknown {
    return JSON.parse(
        JSON.stringify(v, (_k, val) =>
            typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^__.*__$/i.test(val) ? "<id>" : val,
        ),
    );
}

describe("scheniders_signature parity", () => {
    it("is at the version its section stacks say it is", () => {
        // v2 added product_attributes (product) and post_purchase_offer
        // (checkout_success).
        expect(schenidersSignatureTemplate.version).toBe(2);
    });

    it("produces the same config as before the direction/pack split", () => {
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), schenidersSignatureTemplate);
        expect(normalise(cfg)).toMatchSnapshot();
    });
});
