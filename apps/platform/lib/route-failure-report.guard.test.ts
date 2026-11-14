import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Next's onRequestError only sees errors that escape a route handler. Most of
 * our handlers catch their own error and answer 500 with a console line, so
 * before every handler was wrapped, 36 of 73 routes (delivery import, payslip
 * PDF, Meta ads settings, all of Al-Waseet) failed without a Sentry issue.
 *
 * Every exported HTTP handler must go through `withFailureReport` (or
 * `withCronMonitor` for scheduled jobs), which reports a 5xx or a throw.
 */
const API_DIR = join(__dirname, "..", "app", "api");

function routeFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) routeFiles(path, out);
        else if (name === "route.ts") out.push(path);
    }
    return out;
}

describe("every API route reports its failures", () => {
    const files = routeFiles(API_DIR);

    it("finds the route files at all (guards against a silent empty sweep)", () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it("no route exports a bare handler", () => {
        const offenders = files
            .filter((f) => {
                const src = readFileSync(f, "utf8");
                const bare = /^export (async function|function) (GET|POST|PUT|PATCH|DELETE)\b/m.test(src)
                    || /^export \{[^}]*\bas (GET|POST|PUT|PATCH|DELETE)\b/m.test(src);
                const wrapped = /withFailureReport\(|withCronMonitor\(/.test(src);
                return bare || !wrapped;
            })
            .map((f) => relative(API_DIR, f));
        expect(offenders, `wrap these handlers in withFailureReport: ${offenders.join(", ")}`).toEqual([]);
    });
});
