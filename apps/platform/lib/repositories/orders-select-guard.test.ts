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
