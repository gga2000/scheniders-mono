// Prints the newest definition of each named public function, as the
// migrations in packages/supabase/migrations leave it, so a behaviour test
// runs against the code that ships rather than a frozen copy.
//
//   node latest-functions.mjs run_payroll void_payroll > /tmp/fns.sql
//
// Migrations apply in file-name order (timestamp prefix); the last
// CREATE [OR REPLACE] FUNCTION public.<name>( wins. A name that no migration
// defines is an error, so a rename cannot silently leave a test empty.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

/** Every function definition in `sql` named `name`, as complete statements. */
export function definitionsOf(sql, name) {
    const out = [];
    const head = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?"?${name}"?\\s*\\(`, "gi");
    for (let m = head.exec(sql); m; m = head.exec(sql)) {
        // The body is the first dollar-quoted string after the header.
        const open = /\$([A-Za-z_]*)\$/g;
        open.lastIndex = m.index;
        const tag = open.exec(sql);
        if (!tag) throw new Error(`${name}: no dollar-quoted body`);
        const close = sql.indexOf(tag[0], tag.index + tag[0].length);
        if (close < 0) throw new Error(`${name}: unterminated body`);
        const end = sql.indexOf(";", close + tag[0].length);
        out.push(sql.slice(m.index, end + 1));
    }
    return out;
}

export function latestDefinition(name, dir = MIGRATIONS) {
    let latest = null;
    for (const file of readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort()) {
        const found = definitionsOf(readFileSync(join(dir, file), "utf8"), name);
        if (found.length) latest = { file, sql: found[found.length - 1] };
    }
    if (!latest) throw new Error(`no migration defines public.${name}`);
    return latest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    for (const name of process.argv.slice(2)) {
        const { file, sql } = latestDefinition(name);
        process.stdout.write(`-- public.${name} from ${file}\n${sql}\n\n`);
    }
}
