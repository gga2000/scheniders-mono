import { describe, expect, it } from "vitest";
import { notAnId } from "@/lib/route-id";

describe("notAnId", () => {
  it("lets a uuid through", () => {
    expect(notAnId("6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d")).toBeNull();
    expect(notAnId("6D4E6D9B-EAF5-42F9-ABD1-A8AFEE593D9D", "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("answers 404 when any id is not a uuid", async () => {
    for (const ids of [["not-an-id"], ["1"], [""], ["6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d", "x"], ["6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d'--"]]) {
      const answer = notAnId(...ids);
      expect(answer?.status).toBe(404);
      expect(await answer?.json()).toEqual({ error: "Not found" });
    }
  });
});
