import { beforeEach, describe, expect, it, vi } from "vitest";

const adminFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));

const { AnswerLost, ANSWER_LOST } = await import("./answer-lost");
const { sendStep } = await import("./send-json");

const LOST = "No answer came back, so this may have been done. Check the lead before trying again.";

beforeEach(() => adminFetch.mockReset());

/*
 * Round 25 (structure new 5): the console's one sender. A refusal says the
 * server's words; a wordless 5xx or a dropped connection may have been done,
 * and says where to look.
 */
describe("sendStep", () => {
  it("sends JSON with the method and gives back the answer", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ tags: ["vip"] }), { status: 200 }));
    await expect(sendStep("/api/merchants/s1/tags", { tags: ["vip"] }, "PUT")).resolves.toEqual({ tags: ["vip"] });
    const [url, init] = adminFetch.mock.calls[0];
    expect(url).toBe("/api/merchants/s1/tags");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"tags":["vip"]}');
  });

  it("says a refusal in the server's words, and its own words when the server has none", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "This lead no longer exists." }), { status: 404 }));
    await expect(sendStep("/api/leads/l1", {}, "PATCH", LOST, "Not saved.")).rejects.toThrow("This lead no longer exists.");
    adminFetch.mockResolvedValueOnce(new Response("<html>Bad request</html>", { status: 400 }));
    await expect(sendStep("/api/leads/l1", {}, "PATCH", LOST, "Not saved.")).rejects.toThrow("Not saved.");
  });

  it("says a wordless 5xx may have been done, with the step's own words", async () => {
    adminFetch.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    const lost = await sendStep("/api/leads/l1", {}, "PATCH", LOST).catch((error: unknown) => error);
    expect(lost).toBeInstanceOf(AnswerLost);
    expect(lost instanceof Error && lost.message).toBe(LOST);
  });

  it("says a dropped connection may have been done, not the browser's words", async () => {
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(sendStep("/api/leads/l1", {}, "DELETE", LOST)).rejects.toThrow(LOST);
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(sendStep("/api/merchants/s1", { status: "active" }, "PATCH")).rejects.toThrow(ANSWER_LOST);
  });
});
