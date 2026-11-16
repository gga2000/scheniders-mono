// apps/platform/hooks/use-load-failure-hint.ts
//
// One plain sentence for a failed read, instead of the raw error. A raw
// message ("TypeError: Failed to fetch (<ref>.supabase.co)") is English, names
// the backend host, and tells a merchant nothing they can act on. The only
// thing they can act on is their connection, so that is the one distinction.

import { useLanguage } from "@/hooks/use-language";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { loadFailureKind } from "@/lib/load-failure";

/** Returns a function that turns a read error into the sentence to show. */
export function useLoadFailureHint(): (error: unknown) => string {
    const { t } = useLanguage();
    const online = useNetworkStatus();
    return (error) =>
        loadFailureKind(error, online) === "network" ? t("common.loadFailedOfflineHint") : t("common.loadFailedHint");
}
