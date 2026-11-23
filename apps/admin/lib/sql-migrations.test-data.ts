import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/*
 * Tests that hold TypeScript to the database read the SQL as it ships: the
 * newest definition in packages/supabase/migrations (the timestamped files,
 * applied in name order).
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

/**
 * The newest definition of public.<fn>, header to body end. A migration that
 * changes a function's arguments drops it and uses plain CREATE FUNCTION, so
 * both forms count.
 */
export function newestDefinition(fn: string): string {
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

/**
 * The values the newest `add constraint <name> check (<column> in (...))`
 * allows, in the order written: what the database takes today.
 */
export function newestCheckValues(constraint: string): string[] {
  const check = new RegExp(`add\\s+constraint\\s+${constraint}\\s+check\\s*\\(\\s*\\w+\\s+in\\s*\\(([^)]*)\\)`, "gi");
  let latest: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{14}_.*\.sql$/.test(name)).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(check)) {
      latest = [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1]);
    }
  }
  return latest;
}
