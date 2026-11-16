import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recorded, recordingSupabase, respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * Handoff B2 items 7 and 10: every 15 minutes the database pauses shops whose
 * messages mostly fail and reports Interakt's balance and the last hour; this
 * job emails the team through Sentry, one issue (one email) per incident.
 */

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage, captureCheckIn: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));

const { GET } = await import("./route");
const { baghdadDay, whatsappAlerts } = await import("@/lib/whatsapp-watch");

const SHOP = "11111111-1111-4111-8111-111111111111";
const quiet = { interakt_empty_since: null, hour: { reached: 40, failed: 2 }, spike: false, paused: [] };
let watch: unknown;

const cronRequest = () =>
    new Request("http://platform.test/api/cron/whatsapp-watch", {
        headers: { authorization: "Bearer test-cron-secret" },
    });

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    watch = quiet;
    respond((q) => (q.target === "whatsapp_watch" ? { data: watch, error: null } : { data: null, error: null }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("whatsapp-watch cron", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/whatsapp-watch"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("a quiet run asks the database once and emails nobody", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, alerts: [], paused: [] });
        expect(queriesOn("whatsapp_watch")).toHaveLength(1);
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("emails once per incident: Interakt empty, a spike, each paused shop", async () => {
        watch = {
            interakt_empty_since: "2026-11-16T05:00:00Z",
            hour: { reached: 50, failed: 20 },
            spike: true,
            paused: [{ tenant_id: SHOP, display_id: 100801, name: "Shop", paused_at: "2026-11-16T05:15:00Z", reached: 24, bad: 15 }],
        };
        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ alerts: ["interakt-empty", "failure-spike", "shop-paused"], paused: [SHOP] });
        expect(captureMessage).toHaveBeenCalledTimes(3);
        const [empty, spike, paused] = captureMessage.mock.calls.map((c) => c[1]);
        expect(empty).toMatchObject({ level: "error", fingerprint: ["whatsapp-alert", "interakt-empty", "2026-11-16T05:00:00Z"] });
        expect(spike.fingerprint[1]).toBe("failure-spike");
        expect(paused.fingerprint).toEqual(["whatsapp-alert", "shop-paused", SHOP, "2026-11-16T05:15:00Z"]);
        expect(captureMessage.mock.calls[2][0]).toBe("WhatsApp paused for shop #100801: 15 of 24 messages in 24 hours did not reach customers");
    });

    it("a failed or strange database answer is a failed run", async () => {
        respond(() => ({ data: null, error: { message: "db down" } }));
        expect((await GET(cronRequest())).status).toBe(500);
        respond(() => ({ data: { spike: "yes" }, error: null }));
        expect((await GET(cronRequest())).status).toBe(500);
        expect(captureMessage.mock.calls.filter((c) => String(c[0]).startsWith("WhatsApp") || String(c[0]).startsWith("Interakt"))).toEqual([]);
    });
});

describe("whatsappAlerts", () => {
    it("keeps the same Interakt incident in one issue, and a new one in another", () => {
        const at = (since: string) => whatsappAlerts({ ...quiet, interakt_empty_since: since }, new Date())[0].fingerprint;
        expect(at("2026-11-16T05:00:00Z")).toEqual(at("2026-11-16T05:00:00Z"));
        expect(at("2026-11-16T05:00:00Z")).not.toEqual(at("2026-11-17T09:00:00Z"));
    });

    it("a spike emails at most once per Baghdad day", () => {
        const spike = { ...quiet, spike: true };
        // 23:30 UTC on the 15th is already the 16th in Baghdad (UTC+3).
        expect(baghdadDay(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
        expect(whatsappAlerts(spike, new Date("2026-11-15T23:30:00Z"))[0].fingerprint)
            .toEqual(whatsappAlerts(spike, new Date("2026-11-16T20:00:00Z"))[0].fingerprint);
    });
});
