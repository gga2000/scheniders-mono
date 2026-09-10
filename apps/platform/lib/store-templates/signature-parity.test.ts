// The signature direction is being split into direction + content pack.
// This snapshot pins the config it produced BEFORE the split; the refactor
// must reproduce it byte for byte (ids normalised — they are rehashed).
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
    it("produces the same config as before the direction/pack split", () => {
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), schenidersSignatureTemplate);
        expect(normalise(cfg)).toMatchSnapshot();
    });
});
