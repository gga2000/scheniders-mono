"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { deletePasskey, devicePasskeyAvailable, listPasskeys, registerPasskey, type PasskeySummary } from "@/lib/passkey-client";
import { formatDate } from "@/lib/utils";

/**
 * The passkey rows of Settings → sign-in methods: turn fingerprint / face
 * sign-in on for this device, and remove a passkey from a device that is gone.
 */
export function PasskeyRows() {
    const { t } = useLanguage();
    const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
    const [available, setAvailable] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setPasskeys(await listPasskeys());
        } catch {
            // The list is a convenience; the card still offers to add one, and the next load retries.
            setPasskeys([]);
        }
    }, []);

    useEffect(() => {
        void load();
        void devicePasskeyAvailable().then(setAvailable);
    }, [load]);

    const add = async () => {
        setBusy(true);
        const outcome = await registerPasskey();
        setBusy(false);
        if (outcome.ok) {
            toast.success(t("settings.signin.passkeyAdded"));
            await load();
        } else if (outcome.reason === "exists") {
            toast.success(t("settings.signin.passkeyExists"));
        } else if (outcome.reason !== "cancelled") {
            toast.error(t("settings.signin.passkeyFailed"));
        }
    };

    const remove = async (id: string) => {
        setBusy(true);
        const removed = await deletePasskey(id);
        setBusy(false);
        if (!removed) {
            toast.error(t("settings.signin.passkeyFailed"));
            return;
        }
        await load();
    };

    return (
        <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Fingerprint className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t("settings.signin.passkey")}</p>
                        <p className="text-xs text-muted-foreground">
                            {available ? t("settings.signin.passkeyHint") : t("settings.signin.passkeyUnavailable")}
                        </p>
                    </div>
                </div>
                {available && (
                    <button
                        onClick={add}
                        disabled={busy}
                        className="inline-flex items-center justify-center rounded-xl border-2 border-(--card-border) bg-background px-4 h-9 text-sm font-semibold text-foreground hover:bg-(--pastel-mint) hover:text-teal-800 transition-colors disabled:opacity-50 shrink-0"
                    >
                        {t("settings.signin.passkeyAdd")}
                    </button>
                )}
            </div>
            {(passkeys ?? []).map((passkey) => (
                <div key={passkey.id} className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{passkey.label || t("settings.signin.passkeyDevice")}</p>
                        <p className="text-xs text-muted-foreground">
                            {t("settings.signin.passkeyAddedOn", { date: formatDate(passkey.created_at) })}
                        </p>
                    </div>
                    <button
                        onClick={() => remove(passkey.id)}
                        disabled={busy}
                        aria-label={t("settings.signin.passkeyRemove")}
                        title={t("settings.signin.passkeyRemove")}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-(--pastel-pink) hover:text-red-700 transition-colors disabled:opacity-50 shrink-0"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </>
    );
}
