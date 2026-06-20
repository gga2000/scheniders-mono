import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/abandoned-cart-sender", () => ({
    sendCartRecoveryMessage: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendCartRecoveryMessage } from "@/lib/abandoned-cart-sender";

function makeClient(rows: unknown[]) {
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const chain: Record<string, unknown> = {};
    chain.is = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: rows, error: null });
    const client = {
        from: () => ({
            select: () => chain,
            update: () => ({ eq: updateEq }),
        }),
    };
    return { client, updateEq };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/abandoned-cart-recovery", () => {
    it("sends a nudge per pending cart and marks reminded on success", async () => {
        const { client, updateEq } = makeClient([
            { id: "c1", phone: "07700000000", items: [], subtotal_iqd: 1000 },
        ]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
            client,
        );
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
        });

        const res = await GET(new Request("http://x/api/cron/abandoned-cart-recovery"));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.processed).toBe(1);
        expect(json.sent).toBe(1);
        expect(sendCartRecoveryMessage).toHaveBeenCalledTimes(1);
        expect(updateEq).toHaveBeenCalledTimes(1); // reminded_at stamped
    });
});
