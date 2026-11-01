/**
 * Why a read failed, so the copy can say so: "network" when the request never
 * reached the server (the browser is offline, or fetch itself failed, which
 * Supabase reports as HTTP status 0), "server" for an answer with an error
 * status. Only a network failure is the user's connection to blame.
 */
export type LoadFailureKind = "network" | "server";

export class LoadFailure extends Error {
    readonly kind: LoadFailureKind;

    constructor(message: string, kind: LoadFailureKind, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "LoadFailure";
        this.kind = kind;
    }
}

/** The kind of a failed Supabase response, from its HTTP status (0 = no response at all). */
export function loadFailureKindFromStatus(status: number): LoadFailureKind {
    return status === 0 ? "network" : "server";
}

/** The kind of any thrown read error; offline always means the network. */
export function loadFailureKind(error: unknown, online: boolean): LoadFailureKind {
    if (!online) return "network";
    if (error instanceof LoadFailure) return error.kind;
    // fetch() rejects with a TypeError when the request cannot be sent at all.
    return error instanceof TypeError ? "network" : "server";
}
