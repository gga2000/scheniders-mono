// apps/platform/hooks/use-load-failure-hint.ts
//
// One plain sentence for a failed read, instead of the raw error. A raw
// message ("TypeError: Failed to fetch (<ref>.supabase.co)") is English, names
// the backend host, and tells a merchant nothing they can act on. The only
// thing they can act on is their connection, so that is the one distinction.

import { useLanguage } from "@/hooks/use-language";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { loadFailureKind, type LoadFailureKind } from "@/lib/load-failure";

export interface LoadFailureNotice {
    kind: LoadFailureKind;
    /** The i18n key of `hint`, which support uses to tell the two cases apart. */
    hintKey: "common.loadFailedOfflineHint" | "common.loadFailedHint";
    hint: string;
}

/** Returns a function that turns a read error into the sentence to show. */
export function useLoadFailureHint(): (error: unknown) => LoadFailureNotice {
    const { t } = useLanguage();
    const online = useNetworkStatus();
    return (error) => {
        const kind = loadFailureKind(error, online);
        const hintKey = kind === "network" ? "common.loadFailedOfflineHint" : "common.loadFailedHint";
        return { kind, hintKey, hint: t(hintKey) };
    };
}
