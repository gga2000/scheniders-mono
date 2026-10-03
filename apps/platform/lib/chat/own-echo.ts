import type { ChatMessage } from "@/types/chat";

/**
 * What to do with the Realtime `message:new` broadcast for a message WE sent.
 *
 *  - `ignore`    exactly one row already represents this message; leave the cache alone.
 *  - `append`    nothing in this session represents it (we sent it from another tab or
 *                device), so hydrate the full row and add it.
 *  - `drop-bare` both our optimistic placeholder and a bare broadcast row are present;
 *                remove the bare one, the optimistic row owns the message.
 *
 * The distinction matters because the optimistic row changes identity mid-flight: it
 * starts as `temp-<clientMsgId>` and `onSuccess` swaps in the real server id. Deciding
 * on `client_msg_id` alone cannot tell "the placeholder is still here" apart from "the
 * real row landed already" — and acting on that confusion by filtering out
 * `id === incoming.id` deletes the real, saved message.
 */
export type OwnEchoAction = "ignore" | "append" | "drop-bare";

export function resolveOwnEcho(
    rows: Pick<ChatMessage, "id" | "client_msg_id">[],
    incoming: Pick<ChatMessage, "id" | "client_msg_id">,
): OwnEchoAction {
    const haveThisRow = rows.some((m) => m.id === incoming.id);
    const hasOptimistic = rows.some(
        (m) => m.id !== incoming.id && !!m.client_msg_id && m.client_msg_id === incoming.client_msg_id,
    );

    if (!haveThisRow && !hasOptimistic) return "append";
    if (haveThisRow && hasOptimistic) return "drop-bare";
    return "ignore";
}
