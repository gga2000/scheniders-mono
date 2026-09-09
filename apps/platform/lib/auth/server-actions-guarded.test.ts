import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ORD-A12. Every export from a `"use server"` module is a public HTTP endpoint.
 * The action id ships in the client bundle and anyone can POST to it with
 * arbitrary arguments — the page that renders the button is irrelevant.
 *
 * Eleven of thirteen actions once combined "no auth check" with a service-role
 * client, so RLS was bypassed too. One of them granted arbitrary permissions;
 * another credited up to 10,000,000 IQD to a caller-named tenant.
 *
 * The pattern spread by copying: `telegram-link.ts` cited
 * `toggleRolePermissionAction` as the example to follow. A static test is the
 * right shape of guard for that, because it fails on the NEXT copy rather than
 * waiting for someone to notice.
 */

const ACTIONS_DIR = join(__dirname, "..", "..", "app", "actions");

const GUARDS = [
    "requireCaller",
    "requireTenantMember",
    "requireTenantAdmin",
    "resolveCallerTenant",
];

/**
 * Slice each `export async function NAME` up to the next top-level export.
 *
 * Deliberately NOT a brace-matcher: a return type like `Promise<{ success:
 * boolean }>` contains braces, and an earlier version of this helper latched
 * onto those instead of the function body and reported every guarded action as
 * unguarded. Slicing between exports cannot make that mistake.
 */
function actionBodies(src: string): { name: string; body: string }[] {
    const re = /export async function (\w+)\s*\(/g;
    const marks: { name: string; at: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) marks.push({ name: m[1], at: m.index });

    return marks.map(({ name, at }, i) => ({
        name,
        body: src.slice(at, i + 1 < marks.length ? marks[i + 1].at : src.length),
    }));
}

describe("Server Actions are authenticated", () => {
    const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    it("finds the action files at all (guards against a silent empty sweep)", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
        if (!src.includes('"use server"')) continue;

        for (const { name, body } of actionBodies(src)) {
            it(`${file} → ${name}() establishes its caller`, () => {
                const guarded = GUARDS.some((g) => body.includes(`${g}(`));
                expect(
                    guarded,
                    `${name} is a public HTTP endpoint with no caller check. ` +
                        `Call one of ${GUARDS.join(", ")} before doing any work, ` +
                        `and authorise against the resource — never against a tenant id ` +
                        `taken from the arguments.`,
                ).toBe(true);
            });
        }
    }
});

describe("Server Actions do not trust an argument-supplied tenant", () => {
    it("no action file authorises using only a bare tenantId parameter", () => {
        const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
        const offenders: string[] = [];
        for (const file of files) {
            const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
            if (!src.includes('"use server"')) continue;
            // A service-role client with no guard anywhere in the file is the
            // exact shape of the original defect.
            const usesServiceRole = src.includes("createSupabaseServiceClient");
            const hasGuard = GUARDS.some((g) => src.includes(`${g}(`));
            if (usesServiceRole && !hasGuard) offenders.push(file);
        }
        expect(offenders, `service-role action files with no caller check: ${offenders.join(", ")}`).toEqual([]);
    });
});
