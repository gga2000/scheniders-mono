import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { knownTransports, passkeyRelyingParty } from "./passkey-server";

describe("knownTransports", () => {
    it("keeps the transports the spec knows and drops the rest", () => {
        expect(knownTransports(["internal", "hybrid", "teleport"])).toEqual(["internal", "hybrid"]);
        expect(knownTransports(null)).toEqual([]);
    });
});

describe("passkeyRelyingParty", () => {
    it("binds a passkey to the host the request came to", () => {
        const party = passkeyRelyingParty(new NextRequest("https://app.usefermi.com/api/auth/passkey/signin/options"));
        expect(party).toEqual({ rpID: "app.usefermi.com", origin: "https://app.usefermi.com", rpName: "Fermi" });
    });
});
