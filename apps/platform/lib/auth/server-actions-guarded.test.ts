import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every export from a `"use server"` module is a public HTTP endpoint. The
 * action id ships in the client bundle and anyone can POST to it with arbitrary
 * arguments — the page that renders the button is irrelevant to who may call it.
 *
 * Five actions combined "no caller check" with a service-role client, so RLS was
 * bypassed too: `topUpWalletAction` credited up to 10,000,000 IQD to a
 * caller-supplied tenant, `changePlanAction` altered billing, and the three
 * telegram-link actions read and wrote employee account links.
 *
 * The pattern spread by copying — `telegram-link.ts` cited
 * `toggleRolePermissionAction` as the example to follow, back when that one had
 * no check either. A static test is the right shape of guard for that, because
 * it fails on the NEXT copy rather than waiting for someone to notice.
 */

const ACTIONS_DIR = join(__dirname, "..", "..", "app", "actions");

/**
 * Every helper that establishes the caller. `resolveCaller` is a file-local
 * helper in orders.ts; the rest are shared.
 *
 * An earlier version of this list omitted `resolveCaller` and reported all five
 * of orders.ts's actions as unguarded — five false positives on code that was
 * already correct. If a new helper is introduced, add it here, and check it
 * really does prove identity from a token or cookie rather than an argument.
 */
const GUARDS = [
    "resolveCaller",
    "requireVerifiedCaller",
    "requireTenantAdminFor",
    "requireTenantMemberFor",
    "requirePlatformAdmin",
    "requireAdminOverUser",
];

/**
 * Slice each `export async function NAME` up to the next top-level export.
 *
 * Deliberately NOT a brace-matcher: a return type like `Promise<{ success:
 * boolean }>` contains braces, and a brace-matching version of this helper
 * latched onto those instead of the function body and reported every guarded
 * action as unguarded. Slicing between exports cannot make that mistake.
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

function serverActionFiles(): string[] {
    return readdirSync(ACTIONS_DIR)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .filter((f) => readFileSync(join(ACTIONS_DIR, f), "utf8").includes('"use server"'));
}

describe("Server Actions establish their caller", () => {
    const files = serverActionFiles();

    it("finds the action files at all (guards against a silent empty sweep)", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        const src = readFileSync(join(ACTIONS_DIR, file), "utf8");

        // Only actions that reach past RLS need an explicit check: a
        // cookie-scoped client is already constrained to the caller's tenants.
        if (!src.includes("createSupabaseServiceClient")) continue;

        for (const { name, body } of actionBodies(src)) {
            it(`${file} → ${name}() checks the caller before acting`, () => {
                const guarded = GUARDS.some((g) => body.includes(`${g}(`));
                expect(
                    guarded,
                    `${name} builds a service-role client (RLS bypassed) and is a public ` +
                        `HTTP endpoint, but never establishes who is calling. Use one of ` +
                        `${GUARDS.join(", ")} first, and authorise against the tenant named ` +
                        `in the arguments — never trust the tenant id on its own.`,
                ).toBe(true);
            });
        }
    }
});

describe("service-role action files are not left unguarded", () => {
    it("no `use server` file uses service-role with no caller check anywhere", () => {
        const offenders = serverActionFiles().filter((file) => {
            const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
            return src.includes("createSupabaseServiceClient") && !GUARDS.some((g) => src.includes(`${g}(`));
        });
        expect(offenders, `unguarded service-role action files: ${offenders.join(", ")}`).toEqual([]);
    });
});
