import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePrimeLink, type PrimeSendProgress } from "./use-prime-link";

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ session: { access_token: "t" }, tenantId: "tenant" }) }));

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const linked = (over: Record<string, unknown>) => json({ success: true, connected: true, sent: [], skipped: [], failed: [], ...over });
const silent = (ids: string[]) => linked({ failed: ids.map((orderId) => ({ orderId, reason: "prime_unreachable" })) });

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("usePrimeLink send", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const run = async (responses: Array<Response | Error>, ids: string[], progress?: (p: PrimeSendProgress) => void) => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === "/api/prime/connection") return json({ success: true, connected: true });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            if (!next) throw new Error("no more answers");
            return next;
        });
        vi.stubGlobal("fetch", fetchMock);
        const { result } = renderHook(() => usePrimeLink(), { wrapper });
        const pending = result.current.send(ids, progress);
        await vi.runAllTimersAsync();
        return { outcome: await pending, sends: fetchMock.mock.calls.filter(([u]) => u === "/api/prime/send").length };
    };

    it("asks again when Prime is silent and keeps the order out of the Excel file once it answers", async () => {
        const seen: PrimeSendProgress[] = [];
        const { outcome, sends } = await run([silent([A]), linked({ sent: [{ orderId: A, caseId: 7 }] })], [A], (p) => seen.push(p));
        expect(sends).toBe(2);
        expect(outcome).toMatchObject({ connected: true, sent: [{ orderId: A, caseId: 7 }], failed: [] });
        expect(seen.some((p) => p.retry?.attempt === 2 && p.retry.of === 3)).toBe(true);
    });

    it("sends the Excel file only after the third silence, and asks again only for the silent orders", async () => {
        const { outcome, sends } = await run(
            [linked({ sent: [{ orderId: A, caseId: 1 }], failed: [{ orderId: B, reason: "prime_unreachable" }] }), silent([B]), silent([B])],
            [A, B],
        );
        expect(sends).toBe(3);
        expect(outcome).toMatchObject({ sent: [{ orderId: A, caseId: 1 }], failed: [{ orderId: B, reason: "prime_unreachable" }] });
    });

    it("does not ask again when Prime refuses the order", async () => {
        const { outcome, sends } = await run([linked({ failed: [{ orderId: A, reason: "prime_rejected" }] })], [A]);
        expect(sends).toBe(1);
        expect(outcome).toMatchObject({ failed: [{ orderId: A, reason: "prime_rejected" }] });
    });

    it("counts a dropped request as an attempt", async () => {
        const { outcome, sends } = await run([new Error("network"), new Error("network"), linked({ sent: [{ orderId: A, caseId: 9 }] })], [A]);
        expect(sends).toBe(3);
        expect(outcome).toMatchObject({ sent: [{ orderId: A, caseId: 9 }], failed: [] });
    });
});
