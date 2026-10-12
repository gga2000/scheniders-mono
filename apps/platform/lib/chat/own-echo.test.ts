import { describe, it, expect } from "vitest";
import { resolveOwnEcho } from "./own-echo";

const CLIENT_ID = "client-abc";
const REAL_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

const incoming = { id: REAL_ID, client_msg_id: CLIENT_ID };

describe("resolveOwnEcho", () => {
    it("leaves the cache alone once the saved row carries the real id", () => {
        // The regression: onSuccess has already swapped temp-<clientMsgId> for the real
        // id, so the only row matching client_msg_id IS the real row. Treating that as
        // "the optimistic row is still around" and filtering out id === incoming.id
        // deleted the message the user had just sent.
        const rows = [{ id: REAL_ID, client_msg_id: CLIENT_ID }];
        expect(resolveOwnEcho(rows, incoming)).toBe("ignore");
    });

    it("leaves the optimistic placeholder alone while it still owns the message", () => {
        const rows = [{ id: `temp-${CLIENT_ID}`, client_msg_id: CLIENT_ID }];
        expect(resolveOwnEcho(rows, incoming)).toBe("ignore");
    });

    it("drops the bare broadcast row when the placeholder is also present", () => {
        const rows = [
            { id: `temp-${CLIENT_ID}`, client_msg_id: CLIENT_ID },
            { id: REAL_ID, client_msg_id: CLIENT_ID },
        ];
        expect(resolveOwnEcho(rows, incoming)).toBe("drop-bare");
    });

    it("appends when nothing in this session represents the message (other tab/device)", () => {
        const rows = [{ id: OTHER_ID, client_msg_id: "unrelated" }];
        expect(resolveOwnEcho(rows, incoming)).toBe("append");
    });

    it("appends into an empty timeline", () => {
        expect(resolveOwnEcho([], incoming)).toBe("append");
    });

    it("does not treat a null client_msg_id as a match", () => {
        const rows = [{ id: OTHER_ID, client_msg_id: null }];
        expect(resolveOwnEcho(rows, { id: REAL_ID, client_msg_id: null })).toBe("append");
    });
});
