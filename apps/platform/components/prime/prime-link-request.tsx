"use client";

// A shop that isn't linked to Prime asks our team to link it: the admin sends
// the phone number of their Prime account. The request shows in the admin
// app's bell, and «تم الربط» there tells the shop in its notification feed.

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { normalizeIraqiPhone } from "@/lib/order-utils";

const IRAQI_MOBILE = /^07\d{9}$/;

export function primeLinkRequestKey(tenantId: string) {
    return ["prime-link-request", tenantId] as const;
}

/** This shop's open request, if it sent one. */
export function usePrimeLinkRequest(tenantId: string | null) {
    return useQuery({
        queryKey: primeLinkRequestKey(tenantId ?? ""),
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("prime_link_requests")
                .select("id, prime_phone, created_at")
                .eq("tenant_id", tenantId ?? "")
                .is("linked_at", null)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });
}

export function PrimeLinkRequest() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const request = usePrimeLinkRequest(tenantId);
    const [phone, setPhone] = useState("");
    const [invalid, setInvalid] = useState(false);

    const send = useMutation({
        mutationFn: async (primePhone: string) => {
            if (!tenantId) throw new Error("No store");
            const { error } = await supabase.from("prime_link_requests").insert({ tenant_id: tenantId, prime_phone: primePhone });
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: primeLinkRequestKey(tenantId ?? "") }),
    });

    const submit = (e: FormEvent): void => {
        e.preventDefault();
        const normalized = normalizeIraqiPhone(phone);
        if (!IRAQI_MOBILE.test(normalized)) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        send.mutate(normalized);
    };

    if (request.isLoading) return <div className="h-24" aria-busy="true" />;

    if (request.data) {
        return (
            <div data-guide="prime-request" dir={dir} className="mt-6 grid gap-2 rounded-2xl bg-[var(--background)] p-4 text-left">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--button-success)] text-white">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {t("prime.link.sentTitle")}
                </span>
                <span className="text-sm text-muted">{t("prime.link.sentBody", { phone: request.data.prime_phone })}</span>
            </div>
        );
    }

    return (
        <form data-guide="prime-request" onSubmit={submit} className="mt-6 grid gap-3 text-left">
            <label dir={dir} htmlFor="prime-link-phone" className="text-sm font-semibold text-foreground">
                {t("prime.link.phoneLabel")}
            </label>
            <input
                id="prime-link-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXXX"
                aria-invalid={invalid}
                className="h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-base tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {invalid && (
                <span dir={dir} className="text-xs text-red-600">
                    {t("prime.link.phoneInvalid")}
                </span>
            )}
            {send.isError && (
                <span dir={dir} className="text-xs text-red-600">
                    {t("prime.link.failed")}
                </span>
            )}
            <button
                type="submit"
                disabled={send.isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {t("prime.link.send")}
            </button>
            <span dir={dir} className="text-xs text-muted">
                {t("prime.link.note")}
            </span>
        </form>
    );
}
