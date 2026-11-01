import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * No `select("*")` and no bare `.select()` (PostgREST sends it as `select=*`)
 * on product_batches, purchase_orders or purchase_order_items anywhere in the
 * platform app.
 *
 * Migration 20261101010100 takes their cost columns (product_batches.cost_per_unit,
 * purchase_orders.total_cost, purchase_order_items.unit_cost) out of
 * `authenticated`'s SELECT grant, so a `*` read is refused with 42501 for every
 * signed-in caller, admins included. Reads name their columns
 * (lib/repositories/purchase-costs.ts) and get cost from the
 * product_batch_costs / purchase_order_costs RPCs. product-select-guard.test.ts
 * holds the same rule for products.
 */

const PLATFORM_ROOT = path.resolve(__dirname, "../..");
const SCANNED_DIRS = ["app", "lib", "hooks", "components"];
const SKIPPED_DIRS = new Set(["node_modules", ".next", "scripts"]);
const TABLES = ["product_batches", "purchase_orders", "purchase_order_items"];

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

/** Comments blanked, so prose quoting a pattern is not counted. */
function code(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, (line, lead: string) => lead + " ".repeat(line.length - lead.length));
}

const lineAt = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** Each `.from("<table>")` chain, from the call to the end of the statement. */
function chains(source: string, table: string): { line: number; chain: string }[] {
    const out: { line: number; chain: string }[] = [];
    const from = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`, "g");
    let match: RegExpExecArray | null;
    while ((match = from.exec(source))) {
        const rest = source.slice(match.index);
        const ends = [rest.search(/;|\n\s*\n/), rest.slice(1).search(/\.from\(/)]
            .map((at, i) => (at === -1 ? -1 : at + i))
            .filter((at) => at !== -1);
        const end = ends.length ? Math.min(...ends) : -1;
        out.push({ line: lineAt(source, match.index), chain: (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ") });
    }
    return out;
}

/** The chain reads every column: `select("*")` (any quote) or `select()`. */
function readsEveryColumn(chain: string): boolean {
    return /\.select\(\s*(["'`]\s*\*\s*["'`]\s*)?(,[^)]*)?\)/.test(chain);
}

/** `purchase_orders(*)`, `po:purchase_orders(id, *)`, `purchase_order_items!po_id(*)` … */
function starEmbeds(source: string): number[] {
    const lines: number[] = [];
    const embed = /\b(product_batches|purchase_orders|purchase_order_items)(?:!\w+)*\s*\(([^()]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = embed.exec(source))) {
        if (/(^|,)\s*\*\s*(,|$)/.test(match[2])) lines.push(lineAt(source, match.index));
    }
    return lines;
}

describe("readsEveryColumn", () => {
    it.each([
        [`.from("product_batches").select("*").eq("id", id)`, true],
        [`.from("product_batches").insert(row).select().single()`, true],
        [`.from("purchase_orders").select(PURCHASE_ORDER_READ_COLUMNS)`, false],
        [`.from("purchase_orders").insert(po).select("id").single()`, false],
    ])("%s → %s", (chain, expected) => {
        expect(readsEveryColumn(chain)).toBe(expected);
    });
});

describe("starEmbeds", () => {
    it.each([[`.select("*, po:purchase_orders(*)")`], [`.select("id, purchase_order_items( id, * )")`]])(
        "flags %s",
        (src) => {
            expect(starEmbeds(src)).toEqual([1]);
        }
    );
    it("ignores a named embed", () => {
        expect(starEmbeds(`.select("id, purchase_orders(id, po_number)")`)).toEqual([]);
    });
});

describe("platform reads of product_batches, purchase_orders, purchase_order_items", () => {
    it("never select every column", () => {
        const offenders: string[] = [];
        for (const dir of SCANNED_DIRS) {
            for (const file of sourceFiles(path.join(PLATFORM_ROOT, dir))) {
                const source = code(fs.readFileSync(file, "utf8"));
                const where = (line: number) => `${path.relative(PLATFORM_ROOT, file)}:${line}`;
                for (const table of TABLES) {
                    for (const { line, chain } of chains(source, table)) {
                        if (readsEveryColumn(chain)) offenders.push(where(line));
                    }
                }
                for (const line of starEmbeds(source)) offenders.push(where(line));
                // lib/vault-utils.ts reads tables by name and defaults to `*`.
                const byName = /fetchTableData\(\s*["'`](product_batches|purchase_orders|purchase_order_items)["'`]\s*\)/g;
                let call: RegExpExecArray | null;
                while ((call = byName.exec(source))) offenders.push(where(lineAt(source, call.index)));
            }
        }
        expect(offenders).toEqual([]);
    });

    it("finds the chains it is meant to check", () => {
        // A scanner that silently matched nothing would pass the test above.
        const batches = fs.readFileSync(path.join(PLATFORM_ROOT, "components/products/batch-tracking/batch-manager.tsx"), "utf8");
        expect(chains(batches, "product_batches").length).toBeGreaterThan(2);
    });
});
