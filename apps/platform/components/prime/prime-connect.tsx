"use client";

// A store links its own Prime account (Fermi A3). The admin types the phone of
// their Prime account; the server checks it with Prime at once and links it,
// asks which Prime shop the parcels go out from, or keeps the request open with
// the reason (Prime has not linked the account to us yet, another store uses
// it, no active shop, Prime not answering). An open request is looked at again
// every few minutes by the server, and the store is told when it links.

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Clock, Link2, Loader2, RefreshCw, Store, UserPlus, WifiOff } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { authedFetch } from "@/lib/authed-fetch";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import { PRIME_LINK_OUTCOMES } from "@/lib/prime/link-outcomes";
import { cn } from "@/lib/utils";
import { PrimeConnectHelp } from "./prime-connect-help";
import { PrimeNewAccountForm, type PrimeNewAccount } from "./prime-new-account-form";

const IRAQI_MOBILE = /^07\d{9}$/;

const stateSchema = z.object({
    success: z.literal(true),
    connected: z.boolean(),
    request: z
        .object({
            phone: z.string(),
            outcome: z.enum(PRIME_LINK_OUTCOMES).nullable(),
            checkedAt: z.string().nullable(),
            shops: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
            kind: z.enum(["existing", "new"]),
            loginId: z.string().nullable(),
        })
        .nullable(),
});
type LinkState = z.infer<typeof stateSchema>;
type LinkBody = { phone: string } | { shopId: number } | { recheck: true } | { newAccount: PrimeNewAccount };

const errorSchema = z.object({ error: z.string().optional(), code: z.string().optional() });

/** A refusal from /api/prime/link; its message is shown as is when the server wrote one for the merchant. */
class LinkError extends Error {}

function linkStateKey(tenantId: string) {
    return ["prime-link", "self-link", tenantId] as const;
}

const BUTTON =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60";
const PRIMARY = `${BUTTON} bg-[var(--ink)] text-white hover:opacity-90`;
const SECONDARY = `${BUTTON} border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-[var(--background)]`;

export function PrimeConnect() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const key = linkStateKey(tenantId ?? "");
    const [phone, setPhone] = useState("");
    const [invalid, setInvalid] = useState(false);
    const [editing, setEditing] = useState(false);
    const [shopId, setShopId] = useState<number | null>(null);
    // Which form a store with no request is filling: none picked yet, an existing Prime account, or a new one.
    const [path, setPath] = useState<"existing" | "new" | null>(null);

    const state = useQuery({
        queryKey: key,
        enabled: !!tenantId,
        // While a request waits, the server may link it any minute: look again now and then.
        refetchInterval: (query) => (query.state.data?.request ? 60_000 : false),
        queryFn: async (): Promise<LinkState> => {
            const res = await authedFetch("/api/prime/link");
            if (!res.ok) throw new Error(`Prime link state failed: ${res.status}`);
            return stateSchema.parse(await res.json());
        },
    });

    const send = useMutation({
        mutationFn: async (body: LinkBody): Promise<LinkState> => {
            const res = await authedFetch("/api/prime/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json: unknown = await res.json().catch(() => null);
            // Only these refusals carry words meant for the merchant.
            if (!res.ok) {
                const refusal = errorSchema.safeParse(json).data;
                const forMerchant = ["bad_phone", "creating", "closed"].includes(refusal?.code ?? "") || res.status === 429;
                throw new LinkError(forMerchant ? (refusal?.error ?? "") : "");
            }
            return stateSchema.parse(json);
        },
        onSuccess: (answer) => {
            queryClient.setQueryData(key, answer);
            setEditing(false);
            setPath(null);
            // Linked: the Prime page turns into the board.
            if (answer.connected) void queryClient.invalidateQueries({ queryKey: ["prime-link", "connection"] });
        },
    });

    const submit = (e: FormEvent): void => {
        e.preventDefault();
        const normalized = normalizeIraqiPhone(phone);
        if (!IRAQI_MOBILE.test(normalized)) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        send.mutate({ phone: normalized });
    };

    const failure = send.isError ? (send.error instanceof LinkError && send.error.message) || t("prime.link.failed") : null;
    const errorLine = failure && (
        <span dir={dir} role="alert" className="text-xs text-red-600">
            {failure}
        </span>
    );

    if (state.isLoading) return <div className="h-24" aria-busy="true" />;

    if (send.isPending && !("shopId" in (send.variables ?? {})) && !("newAccount" in (send.variables ?? {}))) {
        return (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span dir={dir}>{t("prime.link.checking")}</span>
            </div>
        );
    }

    const request = state.data?.request ?? null;

    if (request?.outcome === "choose_shop" && request.shops && !editing) {
        const shops = request.shops;
        return (
            <div data-guide="prime-request" className="mt-6 grid gap-3 text-left">
                <span dir={dir} className="text-sm font-semibold text-foreground">{t("prime.link.chooseTitle")}</span>
                <span dir={dir} className="text-sm text-muted">{t("prime.link.chooseBody")}</span>
                <div role="radiogroup" aria-label={t("prime.link.chooseTitle")} className="grid gap-2">
                    {shops.map((shop) => (
                        <button
                            key={shop.id}
                            type="button"
                            role="radio"
                            aria-checked={shopId === shop.id}
                            onClick={() => setShopId(shop.id)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm",
                                shopId === shop.id
                                    ? "border-[var(--ink)] bg-[var(--background)] font-semibold text-foreground"
                                    : "border-[var(--card-border)] text-foreground hover:bg-[var(--background)]",
                            )}
                        >
                            <Store className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                            <span dir="auto" className="flex-1 truncate">{shop.name}</span>
                            <span className="text-xs tabular-nums text-muted">{shop.id}</span>
                        </button>
                    ))}
                </div>
                {errorLine}
                <button
                    type="button"
                    disabled={shopId === null || send.isPending}
                    onClick={() => shopId !== null && send.mutate({ shopId })}
                    className={PRIMARY}
                >
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                    {t("prime.link.chooseSend")}
                </button>
                <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted hover:text-foreground">
                    {t("prime.link.changePhone")}
                </button>
            </div>
        );
    }

    if (request?.kind === "new" && !editing) {
        const taken = request.outcome === "login_taken";
        const waiting = request.outcome === "awaiting_approval";
        const failed = request.outcome === "create_failed";
        const body = taken ? "prime.link.new.taken" : waiting ? "prime.link.new.waiting" : failed ? "prime.link.new.failedBody" : "prime.link.new.creating";
        return (
            <div data-guide="prime-request" className="mt-6 grid gap-3 text-left">
                <div className="grid gap-2 rounded-2xl bg-[var(--background)] p-4">
                    <span dir={dir} className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#315EA8] text-white">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {t(taken ? "prime.link.new.takenTitle" : "prime.link.new.sentTitle")}
                    </span>
                    <span dir={dir} className="text-sm text-muted">{t(body, { login: request.loginId ?? "" })}</span>
                    <span dir={dir} className="text-xs text-muted">{t("prime.link.excelMeanwhile")}</span>
                </div>
                {errorLine}
                {(waiting || taken || failed) && (
                    <button
                        type="button"
                        onClick={() => {
                            setEditing(true);
                            setPath(taken ? "new" : null);
                        }}
                        className={SECONDARY}
                    >
                        {t(taken ? "prime.link.new.pickAnother" : "prime.link.new.change")}
                    </button>
                )}
            </div>
        );
    }

    if (request && !editing) {
        const down = request.outcome === "prime_down";
        const body =
            request.outcome === "not_linked"
                ? "prime.link.notLinked"
                : request.outcome === "shared_account"
                  ? "prime.link.shared"
                  : request.outcome === "no_shop"
                    ? "prime.link.noShop"
                    : down
                      ? "prime.link.down"
                      : "prime.link.saved";
        return (
            <div data-guide="prime-request" className="mt-6 grid gap-3 text-left">
                <div className="grid gap-2 rounded-2xl bg-[var(--background)] p-4">
                    <span dir={dir} className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#315EA8] text-white">
                            {down ? <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                        </span>
                        {t(down ? "prime.link.downTitle" : "prime.link.reviewTitle")}
                    </span>
                    <span dir={dir} className="text-sm text-muted">{t(body, { phone: request.phone })}</span>
                    <span dir={dir} className="text-xs text-muted">{t("prime.link.excelMeanwhile")}</span>
                </div>
                {errorLine}
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => send.mutate({ recheck: true })} disabled={send.isPending} className={SECONDARY}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {t("prime.link.recheck")}
                    </button>
                    <button type="button" onClick={() => setEditing(true)} className={SECONDARY}>
                        {t("prime.link.changePhone")}
                    </button>
                </div>
            </div>
        );
    }

    const cancel = request ? () => setEditing(false) : null;
    const choose = path ?? (request && editing ? request.kind : null);

    if (choose === null) {
        const CHOICE = "flex items-start gap-3 rounded-xl border border-[var(--card-border)] px-4 py-3 text-left hover:bg-[var(--background)]";
        return (
            <div data-guide="prime-request" className="mt-6 grid gap-3 text-left">
                <button type="button" onClick={() => setPath("existing")} className={CHOICE}>
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="grid gap-0.5">
                        <span dir={dir} className="text-sm font-semibold text-foreground">{t("prime.link.pathExisting")}</span>
                        <span dir={dir} className="text-xs text-muted">{t("prime.link.pathExistingBody")}</span>
                    </span>
                </button>
                <button type="button" onClick={() => setPath("new")} className={CHOICE}>
                    <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="grid gap-0.5">
                        <span dir={dir} className="text-sm font-semibold text-foreground">{t("prime.link.pathNew")}</span>
                        <span dir={dir} className="text-xs text-muted">{t("prime.link.pathNewBody")}</span>
                    </span>
                </button>
                {cancel && (
                    <button type="button" onClick={cancel} className="text-xs text-muted hover:text-foreground">
                        {t("common.cancel")}
                    </button>
                )}
            </div>
        );
    }

    if (choose === "new") {
        return (
            <PrimeNewAccountForm
                initial={request?.kind === "new" ? { loginId: request.loginId ?? "", phone: request.phone } : undefined}
                pending={send.isPending}
                error={errorLine}
                onSubmit={(account) => send.mutate({ newAccount: account })}
                onBack={() => {
                    setPath(null);
                    if (request) setEditing(false);
                }}
            />
        );
    }

    return (
        <form data-guide="prime-request" onSubmit={submit} className="mt-6 grid gap-3 text-left">
            <PrimeConnectHelp path="existing" />
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
                <span dir={dir} role="alert" className="text-xs text-red-600">
                    {t("prime.link.phoneInvalid")}
                </span>
            )}
            {errorLine}
            <button type="submit" disabled={send.isPending} className={PRIMARY}>
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {t("prime.link.send")}
            </button>
            <span dir={dir} className="text-xs text-muted">
                {t("prime.link.note")}
            </span>
            <button
                type="button"
                onClick={() => {
                    setPath(null);
                    if (request) setEditing(false);
                }}
                className="text-xs text-muted hover:text-foreground"
            >
                {t("prime.link.back")}
            </button>
        </form>
    );
}
