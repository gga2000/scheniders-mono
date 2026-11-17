import { describe, expect, it } from "vitest";
import { refusal } from "./refusal";

/*
 * A refused save shows the server's own words in its toast. Before, the note
 * box, the board drop and the industry list said nothing, and the lead save
 * crashed on a body that was not JSON.
 */

const answer = (body: string, status = 400) => new Response(body, { status, headers: { "content-type": "application/json" } });

describe("refusal", () => {
  it("gives the server's words", async () => {
    expect(await refusal(answer(JSON.stringify({ error: "This lead no longer exists." }), 404), "fallback")).toBe(
      "This lead no longer exists.",
    );
  });

  it("gives the fallback for a body that is not JSON, or has no words", async () => {
    expect(await refusal(new Response("<html>Bad gateway</html>", { status: 502 }), "Could not save the lead.")).toBe(
      "Could not save the lead.",
    );
    expect(await refusal(answer(JSON.stringify({ error: { code: 1 } })), "Could not save the lead.")).toBe(
      "Could not save the lead.",
    );
    expect(await refusal(answer("null"), "Could not save the lead.")).toBe("Could not save the lead.");
  });
});
