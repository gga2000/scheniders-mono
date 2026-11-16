import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * A static `import ... from "@sentry/nextjs"` in a module the browser loads
 * puts the whole Sentry browser SDK on that page's first load; from the
 * language provider it was on every page. Browser code reports through
 * lib/report-error.ts, which loads the SDK lazily.
 *
 * Only server-only code may import it statically: route handlers, and the
 * server modules listed below (nothing in the browser imports them).
 */

const STATIC_IMPORT = /^import\s[^;]*from\s+["']@sentry\/nextjs["']/m;

const SERVER_ONLY = [
    /^app\/api\//,
    /^lib\/mcp\//,
    /^lib\/job-monitor\.ts$/,
    /^lib\/cron-budget\.ts$/,
    /^lib\/qi\/settle\.ts$/,
    /^lib\/prime\/send\.ts$/,
];

describe("Sentry in browser code", () => {
    it("no static @sentry/nextjs import outside server-only modules", () => {
        const root = join(__dirname, "..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "graphify-out") continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
                    const rel = path.slice(root.length + 1);
                    if (SERVER_ONLY.some((re) => re.test(rel))) continue;
                    if (STATIC_IMPORT.test(readFileSync(path, "utf8"))) offenders.push(rel);
                }
            }
        };
        for (const dir of ["app", "components", "hooks", "lib", "store"]) walk(join(root, dir));
        expect(offenders).toEqual([]);
    });

    it("server-only modules allowed above are not imported by client components", () => {
        const root = join(__dirname, "..");
        const serverLib = ["lib/job-monitor", "lib/cron-budget", "lib/qi/settle", "lib/prime/send", "lib/mcp/"];
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "graphify-out") continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
                    const src = readFileSync(path, "utf8");
                    if (!/^\s*["']use client["']/.test(src)) continue;
                    for (const mod of serverLib) if (src.includes(`"@/${mod}`)) offenders.push(`${path.slice(root.length + 1)} -> ${mod}`);
                }
            }
        };
        for (const dir of ["app", "components", "hooks", "lib", "store"]) walk(join(root, dir));
        expect(offenders).toEqual([]);
    });
});
