import { z } from "zod";
import type { DehydratedState } from "@tanstack/react-query";
import { DEFAULT_DASHBOARD_RANGE, readDashboardRange } from "@/lib/analytics/dashboard-range";

/**
 * The first-load read: when a signed-in page is opened, a small script in the
 * page head asks /api/boot for who the user is in their shop and for the
 * page's first figures. The server reads them (as the user, RLS) while the
 * browser is still downloading the page's code, and the app starts from that
 * answer instead of reading the same rows one after another once its code has
 * run. The page itself stays a cached, signed-out shell.
 */

/** What the head script sends: the page, and the choices the page opens on. */
export const BootRequestSchema = z.object({
    path: z.string().startsWith("/").max(200),
    /** /dashboard's `?range=`. */
    range: z.string().max(10).optional(),
    /** /finances' stored period (this browser's localStorage), raw. */
    financePeriod: z.string().max(200).optional(),
});
export type BootRequest = z.infer<typeof BootRequestSchema>;

/** The dashboard period a request names, as the page reads it from its link. */
export function bootDashboardRange(request: BootRequest) {
    return readDashboardRange(request.range ?? null) ?? DEFAULT_DASHBOARD_RANGE;
}

const UserProfileSchema = z.looseObject({
    id: z.string(),
    email: z.string(),
    display_name: z.string().nullable(),
    role: z.string(),
    avatar_url: z.string().nullable(),
    is_active: z.boolean().optional(),
    last_login_at: z.string().nullable().optional(),
    current_tenant_id: z.string().nullable().optional(),
});

export const BootSessionSchema = z.object({
    userId: z.string(),
    /** Null: signed in with no profile (an unprovisioned sign-in). */
    profile: UserProfileSchema.nullable(),
    tenantId: z.string().nullable(),
    role: z.enum(["super_admin", "admin", "employee", "viewer"]).nullable(),
    permissions: z.array(z.string()),
    supportView: z.object({ expiresAt: z.string().nullable() }).nullable(),
});
export type BootSession = z.infer<typeof BootSessionSchema>;

/** TanStack Query's dehydrated cache, as `dehydrate()` writes it: successful reads only. */
function isDehydratedState(value: unknown): value is DehydratedState {
    if (typeof value !== "object" || value === null) return false;
    const { queries, mutations } = value as { queries?: unknown; mutations?: unknown };
    if (!Array.isArray(queries) || !Array.isArray(mutations)) return false;
    return queries.every((q: unknown) => {
        if (typeof q !== "object" || q === null) return false;
        const { queryKey, queryHash, state } = q as { queryKey?: unknown; queryHash?: unknown; state?: unknown };
        if (!Array.isArray(queryKey) || typeof queryHash !== "string") return false;
        if (typeof state !== "object" || state === null) return false;
        const { status, dataUpdatedAt } = state as { status?: unknown; dataUpdatedAt?: unknown };
        return status === "success" && typeof dataUpdatedAt === "number";
    });
}

export const BootPayloadSchema = z.object({
    v: z.literal(1),
    /** The server's clock when it answered (ms), to place the reads on the browser's clock. */
    serverNow: z.number(),
    session: BootSessionSchema.nullable(),
    queries: z.custom<DehydratedState>(isDehydratedState).nullable(),
});
export type BootPayload = z.infer<typeof BootPayloadSchema>;

/** The global the head script leaves its pending answer on. */
export const BOOT_GLOBAL = "__fermiBoot";

/** What the head script resolves to: the answer, or why there is none. */
export interface BootFetchResult {
    /** HTTP status; 0 when the request itself failed (offline, timed out). */
    status: number;
    body: unknown;
    /** The browser's clock when the answer arrived (ms). */
    at: number;
}
