import { useEffect, useState } from "react";
import { usePresence } from "@/hooks/use-presence";

/** How long a silent tab still counts as open (heartbeat is every 4 s). */
const TAB_STALE_MS = 10_000;
const HEARTBEAT_MS = 4_000;

type TabMessage = { kind: "here" | "bye"; tab: string };

/**
 * Who else has this store's editor open. Draft saves write the whole draft,
 * so two open editors overwrite each other's work; the editor warns instead
 * of letting that happen silently.
 *
 * - `others`: display names of OTHER team members (Realtime presence).
 * - `otherTab`: the same browser has the editor open in another tab
 *   (presence is keyed by user, so a second tab of the same user is
 *   invisible to it; a BroadcastChannel covers that case).
 */
export function useEditorCoEditors(tenantId: string): { others: string[]; otherTab: boolean } {
    const { otherUsers } = usePresence(tenantId ? `store-editor:${tenantId}` : "");
    const [otherTab, setOtherTab] = useState(false);

    useEffect(() => {
        if (!tenantId || typeof BroadcastChannel === "undefined") return;
        const tab = Math.random().toString(36).slice(2);
        const channel = new BroadcastChannel(`store-editor:${tenantId}`);
        const seen = new Map<string, number>();
        const refresh = (): void => {
            const now = Date.now();
            for (const [id, at] of seen) if (now - at > TAB_STALE_MS) seen.delete(id);
            setOtherTab(seen.size > 0);
        };
        channel.onmessage = (e: MessageEvent<TabMessage>): void => {
            const msg = e.data;
            if (!msg || msg.tab === tab) return;
            if (msg.kind === "bye") seen.delete(msg.tab);
            else {
                const isNew = !seen.has(msg.tab);
                seen.set(msg.tab, Date.now());
                // Answer a newcomer straight away so both tabs warn at once.
                if (isNew) channel.postMessage({ kind: "here", tab } satisfies TabMessage);
            }
            refresh();
        };
        const beat = (): void => {
            channel.postMessage({ kind: "here", tab } satisfies TabMessage);
            refresh();
        };
        beat();
        const timer = setInterval(beat, HEARTBEAT_MS);
        const bye = (): void => channel.postMessage({ kind: "bye", tab } satisfies TabMessage);
        window.addEventListener("pagehide", bye);
        return () => {
            clearInterval(timer);
            window.removeEventListener("pagehide", bye);
            bye();
            channel.close();
        };
    }, [tenantId]);

    return { others: otherUsers.map((u) => u.display_name), otherTab };
}
