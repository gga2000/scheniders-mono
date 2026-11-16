import { describe, expect, it } from "vitest";
import { leadImportResultSchema, leadImportRow, readLeadImportResult } from "./lead-import";

/*
 * The import route answered { created, skipped, errors: string[] } while the
 * dialog read `imported` and treated `errors` as a number, so every import
 * said "all rows imported". Both sides now share one result shape, and a row
 * is read in one place.
 */

const row = (raw: Record<string, unknown>) => {
  const result = leadImportRow(raw);
  if (result.kind !== "row") throw new Error(`expected a row, got ${result.kind}`);
  return result.row;
};

const bad = (raw: Record<string, unknown>) => {
  const result = leadImportRow(raw);
  if (result.kind !== "bad") throw new Error(`expected a refused row, got ${result.kind}`);
  return result;
};

describe("leadImportRow", () => {
  it("skips a row with no merchant name", () => {
    expect(leadImportRow({ platform: "instagram" })).toEqual({ kind: "skip" });
    expect(leadImportRow({ merchant_name: "   " })).toEqual({ kind: "skip" });
    expect(leadImportRow({ merchant_name: null })).toEqual({ kind: "skip" });
  });

  it("fills the defaults for a row that has only a name", () => {
    expect(row({ merchant_name: "  Noor Fashion " })).toEqual({
      merchant_name: "Noor Fashion",
      platform: "other",
      platform_url: null,
      handle: null,
      follower_count: 0,
      management_name: null,
      management_info: null,
      page_phone: null,
      avg_view_count: 0,
      avg_like_count: 0,
      avg_comments_count: 0,
      address: null,
      city: null,
      priority: "medium",
      tags: [],
    });
  });

  it("reads the platform whatever its case or spacing", () => {
    expect(row({ merchant_name: "A", platform: "Instagram" }).platform).toBe("instagram");
    expect(row({ merchant_name: "A", platform: " TikTok " }).platform).toBe("tiktok");
    expect(row({ merchant_name: "A", platform: "Cold Call" }).platform).toBe("cold_call");
  });

  it("refuses a platform the database cannot hold, in plain words", () => {
    const refused = bad({ merchant_name: "A", platform: "Telegram" });
    expect(refused.name).toBe("A");
    expect(refused.reason).toMatch(/^Platform "Telegram" is not known\. Use one of: /);
    expect(refused.reason).toContain("instagram");
  });

  it("refuses a priority the database cannot hold", () => {
    expect(row({ merchant_name: "A", priority: "HIGH" }).priority).toBe("high");
    expect(bad({ merchant_name: "A", priority: "soon" }).reason).toMatch(/^Priority "soon" is not known\./);
  });

  it("reads counts written the way people write them", () => {
    const read = row({
      merchant_name: "A",
      follower_count: "12,500",
      avg_view_count: "12.5K",
      avg_like_count: "1.2m",
      avg_comments_count: 40,
    });
    expect(read.follower_count).toBe(12500);
    expect(read.avg_view_count).toBe(12500);
    expect(read.avg_like_count).toBe(1200000);
    expect(read.avg_comments_count).toBe(40);
  });

  it("refuses a count that is not a number, in place of saving 0", () => {
    expect(bad({ merchant_name: "A", follower_count: "many" }).reason).toBe('Follower count "many" is not a number.');
    expect(bad({ merchant_name: "A", avg_view_count: "-5" }).reason).toBe('Average views "-5" is not a number.');
  });

  it("refuses a count the column cannot hold", () => {
    expect(row({ merchant_name: "A", follower_count: "2147483647" }).follower_count).toBe(2147483647);
    expect(bad({ merchant_name: "A", follower_count: "5000M" }).reason).toBe('Follower count "5000M" is too large.');
  });

  it("keeps the notes and the tags, and drops the @ of a handle", () => {
    const read = row({
      merchant_name: "A",
      handle: "@noor.fashion",
      management_info: "Sister answers the phone",
      tags: "clothes, baghdad ,, vip",
    });
    expect(read.handle).toBe("noor.fashion");
    expect(read.management_info).toBe("Sister answers the phone");
    expect(read.tags).toEqual(["clothes", "baghdad", "vip"]);
    expect(row({ merchant_name: "A", tags: ["a", " b ", ""] }).tags).toEqual(["a", "b"]);
  });

  it("leaves out anything the dialog does not map", () => {
    const read = row({ merchant_name: "A", status: "converted", created_by: "someone-else", id: "x" });
    expect(Object.keys(read)).not.toContain("status");
    expect(Object.keys(read)).not.toContain("created_by");
    expect(Object.keys(read)).not.toContain("id");
  });
});

describe("readLeadImportResult", () => {
  const answer = { created: 180, skipped: 120, failed: 0, failures: [] };

  it("passes on what the server counted", () => {
    expect(readLeadImportResult(true, answer, 300)).toEqual({ ...answer, problem: null });
  });

  it("counts every row as failed when the request was refused, with the server's words", () => {
    const said = "This file has 620 rows. One import takes up to 500: split the file and import each part.";
    expect(readLeadImportResult(false, { error: said }, 620)).toEqual({
      created: 0,
      skipped: 0,
      failed: 620,
      failures: [],
      problem: said,
    });
  });

  it("does not claim success for an answer in another shape", () => {
    const old = { created: 3, skipped: 1, errors: ["Row 2: boom"] };
    const read = readLeadImportResult(true, old, 5);
    expect(read.created).toBe(0);
    expect(read.failed).toBe(5);
    expect(read.problem).toMatch(/Some rows may be saved/);
    expect(readLeadImportResult(false, null, 5).problem).toMatch(/Some rows may be saved/);
  });

  it("accepts only whole, positive counts", () => {
    expect(leadImportResultSchema.safeParse({ ...answer, created: -1 }).success).toBe(false);
    expect(leadImportResultSchema.safeParse({ ...answer, created: 1.5 }).success).toBe(false);
  });
});
