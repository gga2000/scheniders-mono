import { describe, it, expect } from "vitest";
import { returnsPairingTopic } from "./pairing-topic";

const T = "B5C4F2D4-834F-4AF4-822D-9B9826A8F45A";

describe("returnsPairingTopic", () => {
    it("names the store and the pairing token", () => {
        expect(returnsPairingTopic(T, "abc123def456")).toBe("returns:b5c4f2d4-834f-4af4-822d-9b9826a8f45a:abc123def456");
    });

    it("refuses anything that is not a store id and a plain token", () => {
        expect(returnsPairingTopic("not-a-uuid", "abc123def456")).toBeNull();
        expect(returnsPairingTopic(T, "short")).toBeNull();
        expect(returnsPairingTopic(T, "abc:123:def")).toBeNull();
    });
});
