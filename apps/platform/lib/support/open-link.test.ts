import { describe, expect, it } from "vitest";
import { takeSupportOpenLink } from "./open-link";

describe("takeSupportOpenLink", () => {
    it("drops the marker and keeps the rest of the address", () => {
        expect(takeSupportOpenLink("https://app.test/?support=open")).toBe("/");
        expect(takeSupportOpenLink("https://app.test/orders?tab=new&support=open#top")).toBe("/orders?tab=new#top");
    });

    it("leaves other addresses alone", () => {
        expect(takeSupportOpenLink("https://app.test/orders?tab=new")).toBeNull();
        expect(takeSupportOpenLink("https://app.test/?support=closed")).toBeNull();
    });
});
