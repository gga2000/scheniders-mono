import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
    type RecordedQuery,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * NEW-P1-17: the WhatsApp bot wrote order_status_history rows (202 in 30 days)
 * without tenant_id. Both tables are tenant-scoped by RLS, so those timeline
 * entries were invisible to the merchant who owns the order. Every bot write
 * must carry the order's tenant.
 */

const H = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
// whatsapp-error-handler builds its own service client with supabase-js.
vi.mock("@supabase/supabase-js", async () => {
    const { recordingSupabase: client } = await import("@/lib/__fixtures__/recording-supabase");
    return { createClient: () => client };
});
vi.mock("@/lib/interakt", () => ({
    sendTemplateMessage: H.send,
    TEMPLATE_NAMES: { confirmation: "cod_order_confirm", reminder: "order_reminder", discount: "order_discount_offer" },
}));

import { dispatchWhatsAppEvent } from "./whatsapp-dispatcher";
import { flagOrderForWhatsAppFailure } from "./whatsapp-error-handler";

const TENANT = "55555555-5555-4555-8555-555555555555";
const ORDER = {
    id: "66666666-6666-4666-8666-666666666666",
    order_id: "7209",
    tenant_id: TENANT,
    phone: "07728790786",
    status: "new",
    contact_count: 0,
    attention_reasons: [],
};

const insertedRows = (table: string): Record<string, unknown>[] =>
    queriesOn(table)
        .flatMap((q: RecordedQuery) => q.ops.filter((o) => o.op === "insert").map((o) => o.args[0]))
        .flatMap((rows) => (Array.isArray(rows) ? rows : [rows])) as Record<string, unknown>[];

beforeEach(() => {
    resetRecording();
    respond((q) => {
        if (q.target === "orders") return { data: ORDER, error: null };
        if (q.target === "app_settings") return { data: { value: { enabled: true } }, error: null };
        return { data: null, error: null };
    });
    H.send.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("WhatsApp bot writes carry the order's tenant", () => {
    it("dispatcher: the 'contacted' timeline row and the send log are tenant-stamped", async () => {
        H.send.mockResolvedValue({ success: true, messageId: "m1" });
        await dispatchWhatsAppEvent({ orderId: ORDER.id });

        const history = insertedRows("order_status_history");
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ order_id: ORDER.id, to_status: "contacted", tenant_id: TENANT });

        const logs = insertedRows("whatsapp_logs");
        expect(logs.length).toBeGreaterThan(0);
        for (const row of logs) expect(row.tenant_id).toBe(TENANT);
    });

    it("error handler: the failure timeline row is tenant-stamped", async () => {
        await flagOrderForWhatsAppFailure(
            ORDER.id,
            { success: false, error: "invalid number", statusCode: 400 },
            ORDER.order_id,
            ORDER.phone,
        );
        const history = insertedRows("order_status_history");
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ order_id: ORDER.id, tenant_id: TENANT });
    });
});
