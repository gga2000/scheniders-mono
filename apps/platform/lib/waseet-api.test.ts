import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));

import { readWaseetJson } from "./waseet-api";

describe("readWaseetJson", () => {
    it("parses a normal JSON reply", async () => {
        const res = new Response(JSON.stringify({ status: true, data: [1] }), { headers: { "content-type": "application/json" } });
        await expect(readWaseetJson(res)).resolves.toEqual({ status: true, data: [1] });
    });

    it("names an HTML page instead of a JSON syntax error", async () => {
        const res = new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
        await expect(readWaseetJson(res)).rejects.toThrow("Al-Waseet sent a non-JSON reply (HTTP 502, text/html)");
    });
});
