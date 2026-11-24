import { hydrate, type DehydratedState, type QueryClient } from "@tanstack/react-query";
import { reportError } from "@/lib/report-error";
import { BOOT_GLOBAL, BootPayloadSchema, type BootFetchResult, type BootPayload } from "@/lib/boot/schema";

/** A first-load answer and when it arrived on this browser's clock. */
export interface TakenBoot {
    payload: BootPayload;
    at: number;
}

declare global {
    interface Window {
        [BOOT_GLOBAL]?: Promise<BootFetchResult>;
    }
}

/**
 * This page load's first-load answer (lib/boot/schema.ts), taken once: a later
 * call gets null, so a sign-in or tenant switch later in the visit always
 * reads afresh. Null too when the head script sent nothing (an auth page), or
 * the answer is missing (signed out, offline, a failed read): the app then
 * reads as it always did.
 */
export async function takeBoot(): Promise<TakenBoot | null> {
    if (typeof window === "undefined") return null;
    const pending = window[BOOT_GLOBAL];
    delete window[BOOT_GLOBAL];
    if (!pending) return null;
    const result = await pending;
    if (result.status !== 200) return null;
    const parsed = BootPayloadSchema.safeParse(result.body);
    if (!parsed.success) {
        // The server and this code disagree on the answer's shape: a bug to fix, so it is reported.
        reportError(new Error("first-load answer has an unexpected shape"), {
            tags: { area: "boot", kind: "contract" },
            extra: { issues: parsed.error.issues.slice(0, 10) },
        });
        return null;
    }
    return { payload: parsed.data, at: result.at };
}

/**
 * Put the answer's reads in the query cache, under the keys the page's hooks
 * use. Their read times move onto this browser's clock (the answer arrived at
 * `at`, read at the server's `serverNow`), so a phone whose clock is off still
 * refreshes them on the hooks' usual schedule. A read already in the cache and
 * newer is kept.
 */
export function hydrateBootQueries(queryClient: QueryClient, boot: TakenBoot): void {
    const { queries, serverNow } = boot.payload;
    if (!queries) return;
    const shift = boot.at - serverNow;
    const onBrowserClock: DehydratedState = {
        ...queries,
        queries: queries.queries.map((q) => ({ ...q, state: { ...q.state, dataUpdatedAt: q.state.dataUpdatedAt + shift } })),
    };
    hydrate(queryClient, onBrowserClock);
}
