import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * No `select("*")` — and no bare `.select()`, which PostgREST also sends as
 * `select=*` — on `public.orders` anywhere in the platform app.
 *
 * Migration 20261021090000 takes the margin columns (product_cost, net_profit,
 * waseet_merchant_price, waseet_company_price) out of `authenticated`'s SELECT
 * grant. From then on PostgREST refuses a `*` read of `orders` for every
 * signed-in caller with 42501, admins included: the detail modal, status
 * changes (`update().select()`), the customer panel, the exports and the
 * WhatsApp send would all fail at once. Reads name their columns instead —
 * ORDER_READ_COLUMNS for a full row (lib/repositories/order-columns.ts).
 *
 * Service-role code is held to the same rule. It would still be allowed, but
 * one rule for every file is what this test can check, and no service path
 * needs the margin columns.
 */

const PLATFORM_ROOT = path.resolve(__dirname, "../..");
const SCANNED_DIRS = ["app", "lib", "hooks", "components"];
const SKIPPED_DIRS = new Set(["node_modules", ".next", "scripts"]);

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...sourceFiles(full));
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/** Each `.from("orders")` query chain: from the call to the end of the statement. */
function ordersChains(source: string): { line: number; chain: string }[] {
    const chains: { line: number; chain: string }[] = [];
    const from = /\.from\(\s*["'`]orders["'`]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = from.exec(source))) {
        const rest = source.slice(match.index);
        // A statement ends at `;` or a blank line (files without semicolons);
        // the next `.from(` starts another query (several in one Promise.all).
        const ends = [rest.search(/;|\n\s*\n/), rest.slice(1).search(/\.from\(/)]
            .map((at, i) => (at === -1 ? -1 : at + i))
            .filter((at) => at !== -1);
        const end = ends.length ? Math.min(...ends) : -1;
        chains.push({
            line: source.slice(0, match.index).split("\n").length,
            chain: (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " "),
        });
    }
    return chains;
}

/** The chain reads every column: `select("*")`, `select('*')`, `` select(`*`) `` or `select()`. */
function readsEveryColumn(chain: string): boolean {
    return /\.select\(\s*(["'`]\s*\*\s*["'`]\s*)?(,[^)]*)?\)/.test(chain);
}

/**
 * Lines where a query built in steps reads every column:
 * `let query = supabase.from("orders").update(…)` … `await query.select()`.
 * Its `.from` statement ends before the select, so ordersChains alone misses it.
 */
function stepBuiltFullReads(source: string): number[] {
    const lines = new Set<number>();
    const assigned = /(?:let|const|var)\s+(\w+)\s*=\s*[\w.()\s]*?\.from\(\s*["'`]orders["'`]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = assigned.exec(source))) {
        const read = new RegExp(`\\b${match[1]}\\s*\\.select\\(\\s*(["'\`]\\s*\\*\\s*["'\`]\\s*)?\\)`, "g");
        let use: RegExpExecArray | null;
        while ((use = read.exec(source))) {
            const at = use.index + use[0].indexOf(".select");
            lines.add(source.slice(0, at).split("\n").length);
        }
    }
    return [...lines];
}

/**
 * Lines where another table's select embeds `orders` with a `*` column list:
 * `orders(*)`, `order:orders(*)`, `orders!qc_quarantine_order_id_fkey(*)`,
 * `orders!inner(id, *)`. PostgREST expands the embed into a `*` read of
 * `public.orders`, which is refused with 42501 once the margin columns leave the
 * grant, exactly like `.from("orders").select("*")`. Comments are blanked
 * first so prose that quotes the pattern is not counted.
 */
function embeddedFullOrderReads(source: string): number[] {
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, (line, lead: string) => lead + " ".repeat(line.length - lead.length));
    const lines = new Set<number>();
    const embed = /\borders(?:!\w+)*\s*\(([^()]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = embed.exec(code))) {
        if (/(^|,)\s*\*\s*(,|$)/.test(match[1])) lines.add(code.slice(0, match.index).split("\n").length);
    }
    return [...lines];
}

describe("embeddedFullOrderReads", () => {
    it.each([
        [`.select(\`*, product:products(*), order:orders(*)\`)`, [1]],
        [`.select("id, orders(*)")`, [1]],
        [`.select("id, orders!qc_quarantine_order_id_fkey(*)")`, [1]],
        [`.select("id, order:orders!inner( id, * )")`, [1]],
        [`.select("*,\n  order:orders(\n    *\n  )")`, [2]],
    ])("flags %s", (src, expected) => {
        expect(embeddedFullOrderReads(src)).toEqual(expected);
    });

    it.each([
        [`.select("id, order:orders(id, order_id)")`],
        [`.select("id, orders!inner(id)")`],
        [`// the \`order:orders(*)\` join\nconst a = 1;`],
        [`/* order:orders(*) */ const a = 1;`],
        [`.select("id, customer_orders(*)")`],
    ])("ignores %s", (src) => {
        expect(embeddedFullOrderReads(src)).toEqual([]);
    });
});

describe("stepBuiltFullReads", () => {
    it("flags a select applied to a query variable built from orders", () => {
        const src = `let query = supabase\n  .from("orders")\n  .update(u)\n  .eq("id", id);\nconst { data } = await query\n  .select()\n  .maybeSingle();`;
        expect(stepBuiltFullReads(src)).toEqual([6]);
    });

    it("ignores the same variable name on another table", () => {
        const src = `let query = supabase.from("order_notes").insert(r);\nawait query.select();`;
        expect(stepBuiltFullReads(src)).toEqual([]);
    });

    it("accepts a named column list", () => {
        const src = `let query = supabase.from("orders").update(u);\nawait query.select(ORDER_READ_COLUMNS);`;
        expect(stepBuiltFullReads(src)).toEqual([]);
    });
});

describe("readsEveryColumn", () => {
    it.each([
        [`.from("orders").select("*").eq("id", id)`, true],
        [`.from('orders').select('*', { count: 'exact' })`, true],
        [`.from("orders").update({ a: 1 }).eq("id", id).select().maybeSingle()`, true],
        [`.from("orders").select(ORDER_READ_COLUMNS).eq("id", id)`, false],
        [`.from("orders").select("id", { count: "exact", head: true })`, false],
        [`.from("orders").update({ a: 1 }).eq("id", id).select("id")`, false],
        [`.from("orders").update({ a: 1 }).eq("id", id)`, false],
    ])("%s → %s", (chain, expected) => {
        expect(readsEveryColumn(chain)).toBe(expected);
    });
});

describe("platform reads of `orders`", () => {
    it("never select every column", () => {
        const offenders: string[] = [];
        for (const dir of SCANNED_DIRS) {
            for (const file of sourceFiles(path.join(PLATFORM_ROOT, dir))) {
                const source = fs.readFileSync(file, "utf8");
                const chains = ordersChains(source);
                for (const { line, chain } of chains) {
                    if (readsEveryColumn(chain)) offenders.push(`${path.relative(PLATFORM_ROOT, file)}:${line}`);
                }
                for (const line of stepBuiltFullReads(source)) {
                    offenders.push(`${path.relative(PLATFORM_ROOT, file)}:${line}`);
                }
                for (const line of embeddedFullOrderReads(source)) {
                    offenders.push(`${path.relative(PLATFORM_ROOT, file)}:${line}`);
                }
                // lib/vault-utils.ts reads tables by name and defaults to `*`.
                const byName = /fetchTableData\(\s*["'`]orders["'`]\s*\)/g;
                let call: RegExpExecArray | null;
                while ((call = byName.exec(source))) {
                    offenders.push(`${path.relative(PLATFORM_ROOT, file)}:${source.slice(0, call.index).split("\n").length}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("finds the chains it is meant to check", () => {
        // A scanner that silently matched nothing would pass the test above.
        const repo = fs.readFileSync(path.join(PLATFORM_ROOT, "lib/repositories/order-repository.ts"), "utf8");
        expect(ordersChains(repo).length).toBeGreaterThan(10);
    });
});
