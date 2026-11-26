"use client";

import { useState } from "react";
import { Info, LogOut, Store } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useStoreName } from "@/hooks/use-store-name";

/**
 * Login opened from an email link that no longer works: most often a sign-up
 * link confirmed on the phone and then opened again on a computer. Says the
 * account is ready, and when this browser is still signed in to an account
 * (another shop, say), names it and lets the owner pick instead of carrying
 * them into it.
 */
export function LinkUsedNotice({ onContinue }: { onContinue: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { user, tenantId, signOut } = useAuth();
    const { data: storeName } = useStoreName(user ? tenantId : null);
    const [signingOut, setSigningOut] = useState(false);

    const switchAccount = async () => {
        setSigningOut(true);
        try {
            await signOut();
        } finally {
            setSigningOut(false);
        }
    };

    return (
        <div role="status" className="mt-6 rounded-2xl border border-[#F1E3A6] bg-[#FFF9E0] px-4 py-3.5" data-testid="login-link-used">
            <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-[#A16207]" aria-hidden />
                <p dir={dir} className="text-left text-[14px] leading-relaxed text-[#1E1E1E]">{t("login.linkUsed")}</p>
            </div>
            {user && (
                <div className="mt-3 rounded-xl border border-[#ECE8DD] bg-white p-3" data-testid="login-link-used-signed-in">
                    <p dir={dir} className="text-left text-[12.5px] text-[#8A847A]">{t("login.linkUsed.signedIn")}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1E1E1E] text-[#EFFF00]">
                            <Store className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            {storeName && <p className="truncate text-[14px] font-semibold text-[#1E1E1E]">{storeName}</p>}
                            <p dir="ltr" className="truncate text-left text-[13px] text-[#5F5A52]">{user.email}</p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={switchAccount}
                            disabled={signingOut}
                            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E1E1E] px-3 text-[13.5px] font-semibold text-white hover:bg-black disabled:opacity-60 transition"
                            data-testid="login-link-used-switch"
                        >
                            <LogOut className="h-4 w-4 text-[#EFFF00]" aria-hidden />
                            <span dir={dir}>{t("login.linkUsed.switch")}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onContinue}
                            disabled={signingOut}
                            className="h-11 rounded-xl border border-[#E2DCCF] bg-white px-3 text-[13.5px] font-semibold text-[#1E1E1E] hover:border-[#1E1E1E] disabled:opacity-60 transition"
                            data-testid="login-link-used-continue"
                        >
                            <span dir={dir}>{t("login.linkUsed.continue")}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
