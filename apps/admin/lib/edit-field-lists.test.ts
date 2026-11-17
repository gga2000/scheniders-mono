import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { industryEditSchema } from "./industry-edit";
import { LEAD_LISTS, leadUpdateSchema } from "./lead-update";
import { INDUSTRY_FIELD_WORDS, LEAD_FIELD_WORDS } from "./staff-actions";

/*
 * Round 11 structure finding 10. The fields a lead or industry edit may
 * change are listed three times: in the request schema, in the SQL function
 * that saves them (which refuses any other key), and in the Activity log's
 * words. A field added to the schema alone passed every test, since the
 * route tests stub the database and the SQL suites test SQL alone, and made
 * every save that touched it a 500. These read the newest SQL definitions
 * from the migrations, as they ship, and hold the lists together.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

/** The newest definition of public.<fn> in the migrations, header to body end. */
function newestDefinition(fn: string): string {
  const head = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, "gi");
  let latest = "";
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{14}_.*\.sql$/.test(name)).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(head)) {
      const tag = /\$[A-Za-z_]*\$/.exec(sql.slice(match.index));
      if (!tag) continue;
      const open = match.index + tag.index + tag[0].length;
      latest = sql.slice(match.index, sql.indexOf(tag[0], open));
    }
  }
  return latest;
}

/** The quoted names of `<name> constant text[] := ARRAY[...]` in a definition. */
function sqlList(definition: string, name: string): string[] {
  const list = definition.match(new RegExp(`\\b${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]`, "i"));
  return list ? [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort() : [];
}

const sorted = (names: Iterable<string>) => [...names].sort();

describe("a lead's editable fields", () => {
  const editLead = newestDefinition("admin_edit_lead");
  const editable = sqlList(editLead, "_editable");

  it("are read from the newest admin_edit_lead", () => {
    expect(editLead).toContain("_was jsonb");
    expect(editable).toContain("merchant_name");
    expect(editable.length).toBeGreaterThan(20);
  });

  it("are the request schema's, less status and owner, which save through the bulk change", () => {
    const schema = Object.keys(leadUpdateSchema.shape);
    expect(schema).toEqual(expect.arrayContaining(["status", "assigned_to"]));
    expect(sorted(schema.filter((field) => field !== "status" && field !== "assigned_to"))).toEqual(editable);
  });

  it("each have words in the Activity log", () => {
    expect(sorted(Object.keys(LEAD_FIELD_WORDS))).toEqual(editable);
  });

  it("send whole the lists admin_edit_lead compares with the lead as the form opened it", () => {
    expect(sorted(LEAD_LISTS)).toEqual(sqlList(editLead, "_lists"));
  });
});

describe("an industry's editable fields", () => {
  const editable = sqlList(newestDefinition("admin_edit_industry"), "_editable");

  it("are read from the newest admin_edit_industry", () => {
    expect(editable).toContain("avg_order_value_iqd");
  });

  it("are the request schema's", () => {
    expect(sorted(Object.keys(industryEditSchema.shape))).toEqual(editable);
  });

  it("each have words in the Activity log", () => {
    expect(sorted(Object.keys(INDUSTRY_FIELD_WORDS))).toEqual(editable);
  });
});
