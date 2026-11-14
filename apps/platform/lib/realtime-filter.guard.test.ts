import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Realtime checks every row change against every open channel on its table.
 * The two notifications channels had no filter, so each tab was evaluated
 * (with an RLS check) for every shop's notifications, and Realtime's change
 * polling was the database's biggest consumer (audit R1 speed #6).
 *
 * Every inline `postgres_changes` subscription must carry a `filter`
 * (usually `tenant_id=eq.<id>`). The generic hook builds its config in a
 * variable and takes the filter from its caller, so it is listed here.
 */
const BUILDS_CONFIG_ELSEWHERE = new Set(["hooks/use-realtime-query.ts"]);

const ROOT = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "public", "stories"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
    }
    return out;
}

/** The `{ ... }` config passed right after each "postgres_changes" argument. */
function inlineConfigs(source: string): string[] {
    const configs: string[] = [];
    const re = /["']postgres_changes["']\s*,\s*\{/g;
    for (let m = re.exec(source); m; m = re.exec(source)) {
        let depth = 1;
        let i = m.index + m[0].length;
        while (i < source.length && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            i++;
        }
        configs.push(source.slice(m.index, i));
    }
    return configs;
}

describe("Realtime subscriptions are filtered", () => {
    const files = sourceFiles(ROOT)
        .map((f) => ({ rel: relative(ROOT, f).split("\\").join("/"), src: readFileSync(f, "utf8") }))
        .filter((f) => f.src.includes("postgres_changes") && !BUILDS_CONFIG_ELSEWHERE.has(f.rel));

    it("finds the subscriptions at all (guards against a silent empty sweep)", () => {
        expect(files.length).toBeGreaterThan(5);
    });

    it("every inline postgres_changes config names a filter", () => {
        const offenders = files.flatMap((f) =>
            inlineConfigs(f.src).filter((c) => !/\bfilter\s*:/.test(c)).map(() => f.rel),
        );
        expect(offenders, `add a filter (e.g. tenant_id=eq.<id>) in: ${offenders.join(", ")}`).toEqual([]);
    });
});
