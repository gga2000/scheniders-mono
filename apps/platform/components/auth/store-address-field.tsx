"use client";

// =====================================================================
// StoreAddressField: the store's address at signup (Fermi B11)
// =====================================================================
// The address is offered from the store name as the merchant types it
// (`suggestSlug`), and is theirs to change: Latin letters, numbers and
// dashes. While they type it is checked against GET /api/auth/slug-available.
// An address offered from the name that turns out taken moves to the free
// one the server suggests; an address the merchant typed stays as typed,
// with the suggestion one tap away. The signup route checks it again.
// =====================================================================

import { useEffect, useState } from "react";
import { Check, Globe, Loader2 } from "lucide-react";
import { z } from "zod";
import { storeAddress } from "@scheniders/shared/store-address";
import { env } from "@/lib/env";
import { normalizeSlug, slugRejection, suggestSlug } from "@/lib/tenant-slug";

const verdictSchema = z.object({
    available: z.boolean(),
    reason: z.enum(["format", "reserved", "taken"]).optional(),
    suggestion: z.string().optional(),
});

type Verdict =
    | { slug: string; kind: "answer"; available: boolean; reason?: "format" | "reserved" | "taken"; suggestion?: string }
    | { slug: string; kind: "failed" };

export type StoreAddressState = "empty" | "invalid" | "reserved" | "checking" | "available" | "taken" | "check_failed";

export interface StoreAddress {
    /** The address that will be sent with the signup. */
    slug: string;
    state: StoreAddressState;
    /** A free address near a taken or reserved one. */
    suggestion: string | null;
    /** The merchant typed in the field. */
    edit: (value: string) => void;
    /** Take the suggested address. */
    takeSuggestion: () => void;
    /** The signup route said the address is taken (another signup was faster). */
    markTaken: (slug: string, suggestion: string | null) => void;
}

/** How long typing pauses before the address is checked. */
const CHECK_DELAY_MS = 350;

export function useStoreAddress(businessName: string, initialAddress?: string | null): StoreAddress {
    // null until the merchant types in the field: the address follows the name.
    // An address chosen on usefermi.com (`?slug=`) counts as typed, so the
    // address the owner was shown there is the one they get.
    const [typed, setTyped] = useState<string | null>(() => {
        const handed = normalizeSlug(initialAddress ?? "");
        return handed === "" ? null : handed;
    });
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    // An address offered from the name that was taken, and the free one it moved to.
    const [moved, setMoved] = useState<{ from: string; to: string } | null>(null);

    const offered = suggestSlug(businessName);
    const fromName = typed === null;
    const slug = fromName ? (moved?.from === offered ? moved.to : offered) : normalizeSlug(typed);
    const rejection = slug === "" ? null : slugRejection(slug);

    useEffect(() => {
        if (slug === "" || rejection !== null) return;
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/auth/slug-available?slug=${encodeURIComponent(slug)}`);
                const parsed = verdictSchema.safeParse(res.ok ? await res.json() : null);
                if (!parsed.success) {
                    setVerdict({ slug, kind: "failed" });
                    return;
                }
                setVerdict({ slug, kind: "answer", ...parsed.data });
                if (fromName && !parsed.data.available && parsed.data.suggestion) {
                    setMoved({ from: slug, to: parsed.data.suggestion });
                }
            } catch (err) {
                console.error("[signup] address check failed:", err);
                setVerdict({ slug, kind: "failed" });
            }
        }, CHECK_DELAY_MS);
        return () => clearTimeout(timer);
    }, [slug, rejection, fromName]);

    const answered = verdict?.slug === slug ? verdict : null;
    const state: StoreAddressState =
        slug === ""
            ? "empty"
            : rejection === "format"
              ? "invalid"
              : rejection === "reserved"
                ? "reserved"
                : answered === null
                  ? "checking"
                  : answered.kind === "failed"
                    ? "check_failed"
                    : answered.available
                      ? "available"
                      : answered.reason === "reserved"
                        ? "reserved"
                        : answered.reason === "format"
                          ? "invalid"
                          : "taken";
    const suggestion = answered?.kind === "answer" && !answered.available ? (answered.suggestion ?? null) : null;

    return {
        slug,
        state,
        suggestion,
        edit: setTyped,
        takeSuggestion: () => {
            if (suggestion) setTyped(suggestion);
        },
        markTaken: (taken, next) => {
            setTyped(taken);
            setVerdict({ slug: taken, kind: "answer", available: false, reason: "taken", ...(next ? { suggestion: next } : {}) });
        },
    };
}

/** True when the form may be sent: a check that failed is left to the server. */
export function storeAddressSendable(state: StoreAddressState): boolean {
    return state === "available" || state === "check_failed";
}

export function StoreAddressField({
    address,
    t,
    dir,
}: {
    address: StoreAddress;
    t: (key: string, vars?: Record<string, string | number>) => string;
    dir: "ltr" | "rtl";
}) {
    const root = env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;
    return (
        <div>
            <label htmlFor="signup-store-address" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">
                {t("signup.address")}
            </label>
            <div className="flex h-[52px] items-center rounded-2xl bg-white border border-[#E2DCCF] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus-within:border-[#1E1E1E] focus-within:ring-4 focus-within:ring-[#EFFF00]/50 transition" dir="ltr">
                <Globe className="ms-4 w-[18px] h-[18px] shrink-0 text-[#A8A196]" aria-hidden="true" />
                <input
                    id="signup-store-address"
                    type="text"
                    dir="ltr"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={address.slug}
                    onChange={(e) => address.edit(e.target.value)}
                    placeholder="my-store"
                    aria-describedby="signup-store-address-status"
                    data-testid="signup-store-address"
                    className="min-w-0 flex-1 bg-transparent ps-2 font-mono text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:outline-none"
                />
                <span className="pe-4 font-mono text-[13px] text-[#8A847A] shrink-0">.{root}</span>
            </div>
            <div id="signup-store-address-status" aria-live="polite" dir={dir} className="mt-1.5 min-h-5 text-left text-xs" data-testid="signup-store-address-status">
                {address.state === "empty" && <span className="text-[#8A847A]">{t("signup.addressHint")}</span>}
                {address.state === "checking" && <Loader2 className="h-3 w-3 animate-spin text-[#8A847A]" aria-label={t("signup.addressChecking")} />}
                {address.state === "available" && (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("signup.addressFree", { address: storeAddress(address.slug, root) })}
                    </span>
                )}
                {address.state === "invalid" && <span className="text-[#8A847A]">{t("signup.addressInvalid")}</span>}
                {(address.state === "taken" || address.state === "reserved") && (
                    <span className="text-rose-600">
                        {t(address.state === "taken" ? "signup.addressTaken" : "signup.addressReserved")}
                        {address.suggestion && (
                            <>
                                {" "}
                                <button
                                    type="button"
                                    onClick={address.takeSuggestion}
                                    data-testid="signup-store-address-suggestion"
                                    className="font-semibold text-[#1E1E1E] underline"
                                >
                                    {t("signup.addressUse", { address: address.suggestion })}
                                </button>
                            </>
                        )}
                    </span>
                )}
                {address.state === "check_failed" && <span className="text-[#8A847A]">{t("signup.addressCheckFailed")}</span>}
            </div>
        </div>
    );
}
