"use client";

import { useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";

/**
 * Sign-in methods card (Settings → General).
 *
 * Lets a logged-in employee link their Google account to their EXISTING work
 * account. Linking attaches a Google identity to the same auth user, so all
 * data is preserved — Google just becomes an additional way to sign in. The
 * work email stays the primary identity.
 */
export function AccountLinkingCard() {
    const { user, googleLinked, linkGoogle } = useAuth();
    const [linking, setLinking] = useState(false);

    const handleLink = async () => {
        setLinking(true);
        const { error } = await linkGoogle();
        // On success the browser redirects to Google; we only get here on error.
        if (error) {
            toast.error("Couldn't link Google", error.message);
            setLinking(false);
        }
    };

    return (
        <div className="pastel-card p-6">
            <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-teal-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Sign-in methods</h3>
            </div>

            <div className="space-y-3">
                {/* Email & password — always present */}
                <div className="flex items-center justify-between rounded-xl border border-(--card-border) bg-background px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Email &amp; password</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 shrink-0">
                        <Check className="h-3.5 w-3.5" /> Active
                    </span>
                </div>

                {/* Google */}
                <div className="flex items-center justify-between rounded-xl border border-(--card-border) bg-background px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z" />
                        </svg>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Google</p>
                            <p className="text-xs text-muted-foreground">
                                {googleLinked
                                    ? "You can sign in with Google into this account."
                                    : "Link Google to sign in faster — your account and data stay the same."}
                            </p>
                        </div>
                    </div>
                    {googleLinked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 shrink-0">
                            <Check className="h-3.5 w-3.5" /> Connected
                        </span>
                    ) : (
                        <button
                            onClick={handleLink}
                            disabled={linking}
                            className="inline-flex items-center justify-center rounded-xl border-2 border-(--card-border) bg-background px-4 h-9 text-sm font-semibold text-foreground hover:bg-(--pastel-mint) hover:text-teal-800 transition-colors disabled:opacity-50 shrink-0"
                        >
                            {linking ? "Connecting…" : "Connect"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
