import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { supportPostSchema, supportRefusal } from "./schema";

describe("supportPostSchema", () => {
    it("trims a message and gives it an empty context when none is sent", () => {
        expect(supportPostSchema.parse({ action: "send", body: "  مرحبا  " })).toEqual({
            action: "send",
            body: "مرحبا",
            context: {},
        });
    });

    it("drops fields a client adds, so a body cannot name a shop or a user", () => {
        const parsed = supportPostSchema.parse({
            action: "send",
            body: "hi",
            tenantId: "someone-else",
            context: { path: "/orders", tenant_id: "someone-else" },
        });
        expect(parsed).toEqual({ action: "send", body: "hi", context: { path: "/orders" } });
    });

    it.each([
        ["an empty message", { action: "send", body: "   " }],
        ["a message over 4000 characters", { action: "send", body: "x".repeat(4001) }],
        ["a rating that is not yes or no", { action: "rate", caseId: "8f6f3f3e-6f0f-4c0e-9d57-2f1f3a3b4c5d", rating: "maybe" }],
        ["a rating on something that is not a case id", { action: "rate", caseId: "1", rating: "yes" }],
        ["an unknown action", { action: "solve" }],
        ["an oversized context field", { action: "send", body: "hi", context: { path: "/".repeat(301) } }],
    ])("refuses %s", (_name, body) => {
        expect(supportPostSchema.safeParse(body).success).toBe(false);
    });
});

describe("supportRefusal", () => {
    it("maps the refusals the SQL functions raise and nothing else", () => {
        expect(supportRefusal({ code: "P0001", message: "support_rate_limited" })).toEqual({ status: 429, code: "support_rate_limited" });
        expect(supportRefusal({ code: "P0001", message: "support_already_rated" })?.status).toBe(409);
        expect(supportRefusal({ code: "P0001", message: "anything else" })).toBeNull();
        expect(supportRefusal({ code: "42501", message: "support_rate_limited" })).toBeNull();
        expect(supportRefusal(null)).toBeNull();
    });
});

/*
 * support_cases and support_messages hold every shop's conversations with
 * staff, admin_push_subscriptions holds staff devices and
 * support_saved_replies holds the team's own wording. They are server-only:
 * if a later migration grants them to the browser roles or adds a permissive
 * policy, one shop could read another's messages.
 */
describe("support tables stay server-only", () => {
    const dir = path.resolve(__dirname, "../../../../packages/supabase/migrations");
    const sql = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*--.*$/gm, ""))
        .join("\n");

    it.each(["support_cases", "support_messages", "admin_push_subscriptions", "support_saved_replies"])("%s has RLS on and no browser grants", (table) => {
        expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
        expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
        expect(sql).not.toMatch(new RegExp(`grant[^;]*on (table )?public\\.${table} to[^;]*\\b(anon|authenticated)\\b`, "i"));
        expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${table}\\b`, "i"));
        expect(sql).not.toMatch(new RegExp(`alter table public\\.${table} disable row level security`, "i"));
    });

    it("lets only the service role run the state-change functions", () => {
        for (const fn of [
            "support_merchant_send",
            "support_staff_reply",
            "support_staff_solve",
            "support_merchant_rate",
            "support_notify_staff",
            "support_scoreboard",
        ]) {
            expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`, "i"));
            expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to[^;]*\\b(anon|authenticated|public)\\b`, "i"));
        }
    });
});
