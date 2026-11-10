"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, ClipboardCheck, Tag, Wind, Clock3, Download, HandCoins, Inbox, Lock, MonitorSmartphone, Receipt, LayoutGrid, Settings2, Store, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useShops, useTillMembers, useTillRules, type Shop, type TillMember } from "@/hooks/use-shops";
import {
    lockTillSession,
    pingTillSession,
    saleErrorOf,
    useTillClock,
    useTillClockSet,
    useTillHolds,
    useTillOverview,
    useTillProducts,
    useTillSale,
    useTillStoreName,
    type TillHold,
} from "@/hooks/use-till";
import { addToCart, commissionOf, dateLocale, formatIqd, onShelf, setQuantity, subtotalOf, type CartLine, type PaymentLine, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { connectDrawer, drawerSupported, openDrawer } from "@/lib/till/cash-drawer";
import type { DisplayState, PayShown } from "@/lib/till/customer-display";
import { DEFAULT_TILL_RULES } from "@/lib/till/shop-forms";
import { readPrefs, TEXT_ZOOM, writePrefs, type TextSize, type TillPrefs } from "@/lib/till/prefs";
import { printReceipt, receiptDocument, type ReceiptData } from "@/lib/till/receipt";
import { TillLockScreen } from "./till-lock-screen";
import { TillProductGrid } from "./till-product-grid";
import { TillCartPanel } from "./till-cart-panel";
import { TillPayView } from "./till-pay-view";
import { TillDoneView } from "./till-done-view";
import { TillHistoryDialog } from "./till-history-dialog";
import { TillHoldDialog } from "./till-hold-dialog";
import { TillHoldsDialog } from "./till-holds-dialog";
import { TillPayoutDialog } from "./till-payout-dialog";
import { TillTestersDialog } from "./till-testers-dialog";
import { TillCountDialog } from "./till-count-dialog";
import { TillLabelsDialog } from "./till-labels-dialog";
import { TillScentDialog } from "./till-scent-dialog";
import { newTicket, type Ticket } from "./till-ticket";
import { useCustomerDisplay } from "./use-customer-display";
import { cn } from "@/lib/utils";

type Session = { id: string; cashier: TillMember };
type Done = { receipt: ReceiptData; phone: string | null; printed: boolean; cart: CartLine[] };

const SHOP_KEY = "till.shop";
const PING_EVERY_MS = 30_000;

function readStored(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function writeStored(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Private windows can refuse storage; the till still works, it just forgets.
    }
}

/**
 * The shop till: a full-screen selling console. The device stays signed in as
 * one team member; cashiers switch in with their PIN and every sale is theirs.
 */
export function TillPage() {
    const { t } = useLanguage();
    const shops = useShops();
    const members = useTillMembers();
    const rules = useTillRules();
    const products = useTillProducts();
    const storeName = useTillStoreName();
    const sale = useTillSale();

    const activeShops = useMemo(() => (shops.data ?? []).filter((s) => s.is_active), [shops.data]);
    const [shopId, setShopId] = useState<string | null>(() => readStored(SHOP_KEY));
    const shop: Shop | undefined = activeShops.find((s) => s.id === shopId) ?? (activeShops.length === 1 ? activeShops[0] : undefined);

    const [session, setSession] = useState<Session | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>(() => [newTicket()]);
    const [activeId, setActiveId] = useState<string>(() => tickets[0].id);
    const [view, setView] = useState<"sell" | "pay" | "done">("sell");
    const [done, setDone] = useState<Done | null>(null);
    const [print, setPrint] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyQuery, setHistoryQuery] = useState("");
    const [payoutOpen, setPayoutOpen] = useState(false);
    const [holdOpen, setHoldOpen] = useState(false);
    const [holdsOpen, setHoldsOpen] = useState(false);
    const [testersOpen, setTestersOpen] = useState(false);
    const [countOpen, setCountOpen] = useState(false);
    const [labelsOpen, setLabelsOpen] = useState(false);
    const [scentOpen, setScentOpen] = useState(false);
    // The till renders only after its queries load, never during the server pass, so reading storage here is safe.
    const [prefs, setPrefsState] = useState<TillPrefs>(readPrefs);
    const setPrefs = (next: TillPrefs) => {
        setPrefsState(next);
        writePrefs(next);
    };
    const overview = useTillOverview(session?.id ?? null);
    const clock = useTillClock(session?.id ?? null);
    const clockSet = useTillClockSet();
    const holds = useTillHolds(session?.id ?? null);

    const ticket = tickets.find((x) => x.id === activeId) ?? tickets[0];
    // Stock badges and the "left" note count what is already in this sale's cart.
    const shelf = useMemo(() => onShelf(products.data ?? [], ticket.cart), [products.data, ticket.cart]);
    // Lines that sell past what the system shows in stock: still allowed, but marked on the cart line.
    const overSold = useMemo(() => {
        const keys = new Set<string>();
        for (const l of ticket.cart) {
            const p = shelf.find((x) => x.id === l.product_id);
            const v = l.variant_id ? p?.variants.find((x) => x.id === l.variant_id) : null;
            const left = v ? v.available : p?.available;
            if (left !== undefined && left < 0) keys.add(l.key);
        }
        return keys;
    }, [shelf, ticket.cart]);

    // The customer screen mirrors the sale: idle (logo), the cart, the amount due, then the change.
    const [payShown, setPayShown] = useState<PayShown | null>(null);
    // The ticket whose last Complete did not save, so the pay screen keeps saying so until it does.
    const [failed, setFailed] = useState<{ ticketId: string; message: string } | null>(null);
    const onPayShown = useCallback((p: PayShown) => setPayShown(p), []);
    const shopName = shop?.name ?? "";
    const displayState = useMemo((): DisplayState => {
        if (!session) return { view: "idle", shopName };
        const saleOf = (cart: CartLine[], discount: number) => {
            const subtotal = subtotalOf(cart);
            return {
                shopName,
                lines: cart.map((l) => ({ name: l.name, variant: l.variant_name, quantity: l.quantity, price: l.price, listPrice: l.list_price, image: l.image_url })),
                subtotal,
                discount,
                total: Math.max(0, subtotal - discount),
                saved: discount + cart.reduce((s, l) => s + Math.max(0, l.list_price - l.price) * l.quantity, 0),
            };
        };
        if (view === "done" && done) return { view: "done", ...saleOf(done.cart, done.receipt.discount), total: done.receipt.total, change: done.receipt.change };
        if (view === "pay" && payShown) {
            const qr = payShown.method === "fib" ? shop?.fib_qr_url : payShown.method === "zaincash" ? shop?.zaincash_qr_url : null;
            return { view: "pay", ...saleOf(ticket.cart, ticket.discount), method: payShown.method, due: payShown.due, given: payShown.given, change: payShown.change, qr: qr ?? null };
        }
        if (ticket.cart.length === 0) return { view: "idle", shopName };
        return { view: "cart", ...saleOf(ticket.cart, ticket.discount) };
    }, [session, view, done, ticket.cart, ticket.discount, payShown, shop, shopName]);
    useCustomerDisplay(displayState);

    // Who may switch in here: the shop's staff and the managers.
    const cashiers = useMemo(
        () => (members.data ?? []).filter((m) => (shop ? shop.staff.includes(m.user_id) : false) || m.role === "admin"),
        [members.data, shop],
    );

    const lock = useCallback(
        (reason?: string) => {
            if (session) lockTillSession(session.id).catch(() => undefined);
            setSession(null);
            if (view === "done") setView("sell");
            if (reason) toast({ title: reason, variant: "warning" });
        },
        [session, view],
    );

    // Idle lock and keep-alive: the server ends a quiet session after the same time.
    const lastActive = useRef(0);
    const lastPing = useRef(0);
    const lockMinutes = rules.data?.lock_after_minutes ?? 2;
    useEffect(() => {
        if (!session) return;
        const touch = () => {
            lastActive.current = Date.now();
            if (Date.now() - lastPing.current > PING_EVERY_MS) {
                lastPing.current = Date.now();
                pingTillSession(session.id).then((alive) => {
                    if (!alive) lock(t("till.lock.timedOut"));
                });
            }
        };
        const timer = window.setInterval(() => {
            // The pay screen never locks under a customer mid-payment.
            if (view !== "pay" && Date.now() - lastActive.current > lockMinutes * 60_000) lock();
        }, 5_000);
        window.addEventListener("pointerdown", touch);
        window.addEventListener("keydown", touch);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("pointerdown", touch);
            window.removeEventListener("keydown", touch);
        };
    }, [session, lockMinutes, lock, t, view]);

    const updateTicket = (next: Ticket) => setTickets((all) => all.map((x) => (x.id === next.id ? next : x)));
    const add = (product: TillProduct, variant: TillVariant | null) => {
        if (view === "done") startNext();
        setTickets((all) => all.map((x) => (x.id === activeId ? { ...x, cart: addToCart(x.cart, product, variant) } : x)));
    };
    const openTicket = () => {
        const fresh = newTicket();
        setTickets((all) => [...all, fresh]);
        setActiveId(fresh.id);
        setView("sell");
    };
    const startNext = () => {
        setDone(null);
        setView("sell");
    };
    // Lines kept aside leave the cart; an emptied ticket closes like a finished sale.
    const keptAside = (keys: string[]) => {
        const gone = new Set(keys);
        const left = ticket.cart.filter((l) => !gone.has(l.key));
        if (left.length > 0) {
            updateTicket({ ...ticket, cart: left, discount: Math.min(ticket.discount, subtotalOf(left)) });
            return;
        }
        const rest = tickets.filter((x) => x.id !== ticket.id);
        const fresh = newTicket();
        setTickets(rest.length ? rest : [fresh]);
        setActiveId(rest[0]?.id ?? fresh.id);
    };
    // The customer came back: their kept bottles open as a new sale in their name.
    const sellHeld = (hold: TillHold) => {
        const product = products.data?.find((p) => p.id === hold.product_id);
        if (!product) {
            toast({ title: t("till.holds.missing", { name: hold.name }), variant: "error" });
            return;
        }
        const variant = hold.variant_id ? (product.variants.find((v) => v.id === hold.variant_id) ?? null) : null;
        const withHold = (cart: CartLine[]) => {
            const next = addToCart(cart, product, variant);
            const line = next.find((l) => l.product_id === hold.product_id && l.variant_id === (variant?.id ?? null));
            const had = cart.find((l) => l.key === line?.key)?.quantity ?? 0;
            return line ? setQuantity(next, line.key, had + hold.quantity) : next;
        };
        // Several bottles kept for one customer go into one sale.
        const same = tickets.find((x) => x.customerName.trim() === hold.customer_name && x.phone.trim() === (hold.customer_phone ?? ""));
        if (same) {
            updateTicket({ ...same, cart: withHold(same.cart) });
            setActiveId(same.id);
        } else {
            const fresh = { ...newTicket(), cart: withHold([]), customerName: hold.customer_name, phone: hold.customer_phone ?? "" };
            setTickets((all) => [...all.filter((x) => x.cart.length > 0 || x.id !== activeId), fresh]);
            setActiveId(fresh.id);
        }
        startNext();
    };
    // Same items again for the next customer, in the fresh ticket the sale left open.
    const sellAgain = () => {
        if (!done) return;
        const again = done.cart;
        setTickets((all) => all.map((x) => (x.id === activeId ? { ...x, cart: again } : x)));
        startNext();
    };

    const complete = (payments: PaymentLine[], change: number) => {
        if (!session || !shop) return;
        const phone = ticket.phone.trim() ? normalizeIraqiMobile(ticket.phone) : null;
        const subtotal = subtotalOf(ticket.cart);
        sale.mutate(
            {
                sessionId: session.id,
                clientSaleId: ticket.id,
                lines: ticket.cart.map((l) =>
                    l.price < l.list_price
                        ? { product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, price: l.price }
                        : { product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity },
                ),
                discount: ticket.discount,
                approvalId: ticket.approval?.id ?? null,
                payments,
                customerName: ticket.customerName.trim(),
                phone,
            },
            {
                onSuccess: (r) => {
                    const receipt: ReceiptData = {
                        storeName: storeName.data ?? "",
                        shop,
                        orderNumber: r.order.order_id,
                        cashier: session.cashier.display_name,
                        at: r.order.created_at,
                        lines: ticket.cart,
                        subtotal,
                        discount: ticket.discount,
                        total: r.order.total,
                        payments,
                        change: r.change || change,
                        customerName: ticket.customerName.trim() || null,
                    };
                    if (print) printReceipt(receiptDocument(receipt));
                    if (prefs.drawer && payments.some((p) => p.method === "cash")) {
                        openDrawer()
                            .then((opened) => {
                                if (!opened) toast({ title: t("till.drawer.notConnected"), variant: "warning" });
                            })
                            .catch((err: unknown) => {
                                Sentry.captureException(err, { tags: { area: "till", op: "drawer" } });
                                toast({ title: t("till.drawer.failed"), variant: "error" });
                            });
                    }
                    setDone({ receipt, phone, printed: print, cart: ticket.cart });
                    // The sold ticket leaves; held ones stay as tabs.
                    const rest = tickets.filter((x) => x.id !== ticket.id);
                    const fresh = newTicket();
                    setTickets([fresh, ...rest]);
                    setActiveId(fresh.id);
                    setView("done");
                },
                onError: (err) => {
                    const why = saleErrorOf(err);
                    if (why === "approval_expired" || why === "approval_too_small") {
                        updateTicket({ ...ticket, approval: null });
                        setView("sell");
                    }
                    if (why === "locked") lock(t("till.lock.timedOut"));
                    // Back on the sell screen a toast says why; on the pay screen the box above Complete does, without covering it.
                    else if (why === "approval_expired" || why === "approval_too_small") toast({ title: t(`till.sale.error.${why}`), variant: "error" });
                    else setFailed({ ticketId: ticket.id, message: why === "failed" ? t("till.pay.notSaved") : t(`till.sale.error.${why}`) });
                },
            },
        );
    };

    // Till rules carry the cashier's discount limit; until they load, "no limit" would be a guess, so the till waits.
    if (shops.isPending || members.isPending || rules.isPending) {
        return <div className="h-full animate-pulse bg-[var(--card-border)]/20" aria-busy="true" />;
    }

    if (!shop) {
        return (
            <TillFrame title={t("till.top.pickShop")}>
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B8E8E0] text-[#1E1E1E]">
                        <Store className="h-6 w-6" aria-hidden="true" />
                    </span>
                    {activeShops.length === 0 ? (
                        <>
                            <p className="text-lg font-semibold text-foreground">{t("till.top.noShops")}</p>
                            <Link href="/shops" className="inline-flex h-12 items-center rounded-2xl bg-[var(--ink)] px-6 text-sm font-semibold text-white dark:bg-[#EFFF00] dark:text-[#121212]">
                                {t("till.shops.addFirst")}
                            </Link>
                        </>
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-foreground">{t("till.top.whichShop")}</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {activeShops.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                            setShopId(s.id);
                                            writeStored(SHOP_KEY, s.id);
                                        }}
                                        className="h-14 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-6 text-base font-semibold text-foreground"
                                    >
                                        <span dir="auto">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </TillFrame>
        );
    }

    const changeShop =
        activeShops.length > 1
            ? () => {
                  lock();
                  setShopId(null);
                  writeStored(SHOP_KEY, null);
              }
            : undefined;

    if (!session) {
        return (
            <TillFrame shopName={shop.name} onChangeShop={changeShop}>
                <TillLockScreen
                    shopId={shop.id}
                    cashiers={cashiers}
                    onUnlocked={(id, cashier) => {
                        lastActive.current = Date.now();
                        lastPing.current = Date.now();
                        setSession({ id, cashier });
                    }}
                />
            </TillFrame>
        );
    }

    const isManager = session.cashier.role === "admin";
    const held = tickets.filter((x) => x.cart.length > 0);

    return (
        <TillFrame
            shopName={shop.name}
            onChangeShop={changeShop}
            cashier={session.cashier.display_name}
            onLock={() => lock()}
            today={overview.data?.today}
            mine={overview.data?.mine}
            onHistory={() => {
                setHistoryQuery("");
                setHistoryOpen(true);
            }}
            commission={commissionOf(overview.data?.mine.total ?? 0, rules.data?.commission_pct ?? 0)}
            onPayout={() => setPayoutOpen(true)}
            goal={shop.daily_goal}
            clock={
                clock.isSuccess
                    ? {
                          since: clock.data?.shop_id === shop.id ? clock.data.clock_in : null,
                          pending: clockSet.isPending,
                          onSet: (clockIn: boolean) =>
                              clockSet.mutate(
                                  { sessionId: session.id, clockIn },
                                  { onError: () => toast({ title: t("till.clock.failed"), variant: "error" }) },
                              ),
                      }
                    : undefined
            }
            prefs={prefs}
            onPrefs={setPrefs}
            onCount={isManager ? () => setCountOpen(true) : undefined}
            onLabels={isManager ? () => setLabelsOpen(true) : undefined}
            onScent={isManager ? () => setScentOpen(true) : undefined}
        >
            {view === "pay" ? (
                <TillPayView
                    ticket={ticket}
                    total={Math.max(0, subtotalOf(ticket.cart) - ticket.discount)}
                    pending={sale.isPending}
                    print={print}
                    onPrint={setPrint}
                    hasPhone={!!ticket.phone.trim() && !!normalizeIraqiMobile(ticket.phone)}
                    payQr={{ fib: shop.fib_qr_url ?? undefined, zaincash: shop.zaincash_qr_url ?? undefined }}
                    onShown={onPayShown}
                    failed={failed?.ticketId === ticket.id && !sale.isPending ? failed.message : null}
                    onParts={(payments) => updateTicket({ ...ticket, payments })}
                    onBack={() => setView("sell")}
                    onComplete={complete}
                />
            ) : view === "done" && done ? (
                <TillDoneView
                    receipt={done.receipt}
                    phone={done.phone}
                    printed={done.printed}
                    held={held.map((x, i) => ({
                        id: x.id,
                        label: x.customerName.trim() || t("till.cart.walkIn", { n: i + 1 }),
                        total: Math.max(0, subtotalOf(x.cart) - x.discount),
                    }))}
                    onOpenHeld={(id) => {
                        setActiveId(id);
                        startNext();
                    }}
                    onNext={startNext}
                    onSellAgain={sellAgain}
                />
            ) : (
                <div className="flex min-h-0 flex-1">
                    <TillProductGrid products={shelf} loading={products.isPending} overview={overview.data} sound={prefs.sound} compact={prefs.compact}
                        onAdd={add}
                        onReceiptCode={(code) => {
                            setHistoryQuery(code);
                            setHistoryOpen(true);
                        }}
                    />
                    <TillCartPanel
                        tickets={tickets}
                        activeId={ticket.id}
                        onSwitch={setActiveId}
                        onNew={openTicket}
                        onChange={updateTicket}
                        onPay={() => setView("pay")}
                        canDiscount
                        discountLimitPct={rules.data?.cashier_discount_pct ?? null}
                        isManager={isManager}
                        cashierName={session.cashier.display_name}
                        sessionId={session.id}
                        overSold={overSold}
                        managers={(members.data ?? []).filter((m) => m.role === "admin" && m.has_pin && m.user_id !== session.cashier.user_id)}
                        onKeepAside={() => setHoldOpen(true)}
                        holdsCount={holds.data?.length ?? 0}
                        onHolds={() => setHoldsOpen(true)}
                        onTesters={() => setTestersOpen(true)}
                    />
                </div>
            )}
            {holdOpen && ticket.cart.length > 0 && (
                <TillHoldDialog
                    sessionId={session.id}
                    lines={ticket.cart}
                    customerName={ticket.customerName}
                    phone={ticket.phone}
                    onKept={keptAside}
                    onClose={() => setHoldOpen(false)}
                />
            )}
            {holdsOpen && (
                <TillHoldsDialog sessionId={session.id} holds={holds.data ?? []} onSell={sellHeld} onClose={() => setHoldsOpen(false)} />
            )}
            {testersOpen && (
                <TillTestersDialog
                    sessionId={session.id}
                    products={shelf}
                    isManager={isManager}
                    managers={(members.data ?? []).filter((m) => m.role === "admin" && m.has_pin && m.user_id !== session.cashier.user_id)}
                    onClose={() => setTestersOpen(false)}
                />
            )}
            {countOpen && (
                <TillCountDialog
                    sessionId={session.id}
                    products={products.data ?? []}
                    chips={overview.data?.chips ?? []}
                    sound={prefs.sound}
                    onClose={() => setCountOpen(false)}
                />
            )}
            {labelsOpen && (
                <TillLabelsDialog sessionId={session.id} products={products.data ?? []} storeName={storeName.data ?? ""} onClose={() => setLabelsOpen(false)} />
            )}
            {scentOpen && <TillScentDialog sessionId={session.id} products={products.data ?? []} onClose={() => setScentOpen(false)} />}
            {payoutOpen && (
                <TillPayoutDialog
                    sessionId={session.id}
                    isManager={isManager}
                    pinAbove={rules.data?.payout_pin_above ?? DEFAULT_TILL_RULES.payout_pin_above}
                    managers={(members.data ?? []).filter((m) => m.role === "admin" && m.has_pin && m.user_id !== session.cashier.user_id)}
                    onClose={() => setPayoutOpen(false)}
                />
            )}
            {historyOpen && <TillHistoryDialog sessionId={session.id} shop={shop} initialQuery={historyQuery} storeName={storeName.data ?? ""} onClose={() => setHistoryOpen(false)} />}
        </TillFrame>
    );
}

function TillFrame({
    title,
    shopName,
    onChangeShop,
    cashier,
    onLock,
    today,
    mine,
    onHistory,
    commission,
    onPayout,
    goal,
    clock,
    prefs,
    onPrefs,
    onCount,
    onLabels,
    onScent,
    children,
}: {
    title?: string;
    shopName?: string;
    onChangeShop?: () => void;
    cashier?: string;
    onLock?: () => void;
    today?: { count: number; total: number };
    mine?: { count: number; total: number };
    onHistory?: () => void;
    /** The cashier's commission on today's sales, or null when the store pays none. */
    commission?: number | null;
    onPayout?: () => void;
    /** The shop's sales target for today; null = none set. */
    goal?: number | null;
    /** The cashier's shift: since = clocked in at this shop at that time, or null. */
    clock?: { since: string | null; pending: boolean; onSet: (clockIn: boolean) => void };
    prefs?: TillPrefs;
    onPrefs?: (p: TillPrefs) => void;
    onCount?: () => void;
    onLabels?: () => void;
    onScent?: () => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    const chip = "inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10";
    const zoom = TEXT_ZOOM[prefs?.textSize ?? "normal"];
    return (
        <div className="till-screen flex h-full flex-col bg-background" style={zoom === 1 ? undefined : { zoom }}>
            <header className="relative grid h-[64px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[#1E1E1E] px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Link href="/orders" className={`${chip} px-3`} aria-label={t("till.top.exit")} title={t("till.top.exit")}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {shopName &&
                        (onChangeShop ? (
                            <button type="button" onClick={onChangeShop} className={chip} title={t("till.top.change")}>
                                <Store className="h-4 w-4" aria-hidden="true" />
                                <span dir="auto" className="max-w-[160px] truncate">{shopName}</span>
                            </button>
                        ) : (
                            <span className={`${chip} hover:bg-transparent`}>
                                <Store className="h-4 w-4" aria-hidden="true" />
                                <span dir="auto" className="max-w-[160px] truncate">{shopName}</span>
                            </span>
                        ))}
                    {cashier && onLock && (
                        <button type="button" onClick={onLock} className={chip} title={t("till.top.lock")}>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E4C1F9] text-xs text-[#1E1E1E]">{cashier.slice(0, 1).toUpperCase()}</span>
                            <span dir="auto" className="max-w-[120px] truncate">{cashier}</span>
                            <Lock className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />
                        </button>
                    )}
                    {clock && <ClockChip clock={clock} chip={chip} />}
                </div>
                {title ? <h1 className="text-base font-bold text-white">{title}</h1> : <TillClock />}
                <div className="flex items-center justify-end gap-2">
                    {today && onHistory && (
                        <button type="button" onClick={onHistory} className={chip} title={t("till.history.title")}>
                            <Receipt className="h-4 w-4" aria-hidden="true" />
                            {/* "No sales yet" already says it; a lone 0 beside it is noise. */}
                            {today.count > 0 && <span className="tabular-nums">{formatIqd(today.total)}</span>}
                            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-white/75" dir="auto">
                                {t("till.top.today", { n: today.count, count: today.count })}
                            </span>
                            {goal ? (
                                <span className="whitespace-nowrap rounded-full bg-[#EFFF00]/15 px-2 py-0.5 text-xs font-bold tabular-nums text-[#EFFF00]" dir="auto">
                                    {t("till.top.goalPct", { pct: Math.min(999, Math.round((today.total / goal) * 100)) })}
                                </span>
                            ) : null}
                            {mine && mine.count > 0 && mine.count !== today.count && (
                                <span className="whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium tabular-nums text-white/80" dir="auto">
                                    {t("till.top.mine", { n: mine.count })}
                                </span>
                            )}
                        </button>
                    )}
                    {onPayout && (
                        <button type="button" onClick={onPayout} className={chip} title={t("till.payout.title")}>
                            <HandCoins className="h-4 w-4" aria-hidden="true" />
                            <span className="whitespace-nowrap" dir="auto">{t("till.top.payout")}</span>
                        </button>
                    )}
                    {commission != null && (
                        <span className={cn(chip, "cursor-default")}>
                            <span className="whitespace-nowrap text-xs font-medium text-white/75" dir="auto">{t("till.top.commission")}</span>
                            <span className="tabular-nums">{formatIqd(commission)}</span>
                        </span>
                    )}
                    {prefs && onPrefs && <TillSettings prefs={prefs} onPrefs={onPrefs} onCount={onCount} onLabels={onLabels} onScent={onScent} chip={chip} />}
                </div>
                {goal && today ? <GoalBar goal={goal} total={today.total} /> : null}
            </header>
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
    );
}

/** A thin line along the bottom of the header: today's sales against the shop's goal. */
function GoalBar({ goal, total }: { goal: number; total: number }) {
    const { t } = useLanguage();
    const pct = Math.min(100, Math.round((total / goal) * 100));
    const label = t("till.top.goal", { pct, goal: formatIqd(goal) });
    return (
        <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={label}
            title={label}
        >
            <div className={cn("h-full transition-[width] duration-700", pct >= 100 ? "bg-[#8FE3A8]" : "bg-[#EFFF00]")} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Clock in when the shift starts; when on, shows since when, and a second tap clocks out. */
function ClockChip({ clock, chip }: { clock: NonNullable<Parameters<typeof TillFrame>[0]["clock"]>; chip: string }) {
    const { t } = useLanguage();
    const [confirming, setConfirming] = useState(false);
    useEffect(() => {
        if (!confirming) return;
        const id = window.setTimeout(() => setConfirming(false), 3000);
        return () => window.clearTimeout(id);
    }, [confirming]);
    if (!clock.since) {
        return (
            <button
                type="button"
                disabled={clock.pending}
                onClick={() => clock.onSet(true)}
                className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#EFFF00] px-4 text-sm font-bold text-[#121212] disabled:opacity-60"
            >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                {t("till.clock.in")}
            </button>
        );
    }
    const since = new Date(clock.since).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" });
    return (
        <button
            type="button"
            disabled={clock.pending}
            onClick={() => {
                if (!confirming) return setConfirming(true);
                setConfirming(false);
                clock.onSet(false);
            }}
            className={cn(chip, confirming && "border-[#FDE7EA] bg-[#FDE7EA] text-[#991B1B] hover:bg-[#FDE7EA]")}
            aria-live="polite"
        >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            <span className="whitespace-nowrap tabular-nums" dir="auto">{confirming ? t("till.clock.confirmOut") : t("till.clock.since", { time: since })}</span>
        </button>
    );
}

/** Baghdad time and date, ticking each minute. */
function TillClock() {
    const { language } = useLanguage();
    const locale = dateLocale(language);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 15_000);
        return () => window.clearInterval(id);
    }, []);
    return (
        <p className="flex flex-col items-center leading-tight text-white">
            <span className="text-xl font-bold tabular-nums">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}</span>
            <span className="whitespace-nowrap text-[11px] font-medium text-white/75">{now.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Baghdad" })}</span>
        </p>
    );
}

/** Opening the cash drawer on cash sales: pick the printer's port once, then test it. */
function DrawerSetting({ prefs, onPrefs }: { prefs: TillPrefs; onPrefs: (p: TillPrefs) => void }) {
    const { t } = useLanguage();
    const [busy, setBusy] = useState(false);
    if (!drawerSupported()) return <p className="text-left text-xs text-muted" dir="auto">{t("till.drawer.unsupported")}</p>;
    const run = async (step: () => Promise<boolean>, onDone: (ok: boolean) => void) => {
        setBusy(true);
        try {
            onDone(await step());
        } catch (err: unknown) {
            // The cashier closing the port picker is not a failure.
            if (!(err instanceof DOMException && err.name === "NotFoundError")) {
                Sentry.captureException(err, { tags: { area: "till", op: "drawer" } });
                toast({ title: t("till.drawer.failed"), variant: "error" });
            }
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--card-border)] p-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Inbox className="h-4 w-4" aria-hidden="true" />
                {t("till.drawer.title")}
            </span>
            <span className="text-left text-xs text-muted" dir="auto">{prefs.drawer ? t("till.drawer.on") : t("till.drawer.hint")}</span>
            <span className="flex gap-2">
                {prefs.drawer ? (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(openDrawer, (ok) => !ok && toast({ title: t("till.drawer.notConnected"), variant: "warning" }))}
                            className="h-10 flex-1 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-foreground"
                        >
                            {t("till.drawer.test")}
                        </button>
                        <button
                            type="button"
                            onClick={() => onPrefs({ ...prefs, drawer: false })}
                            className="h-10 flex-1 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-foreground"
                        >
                            {t("till.drawer.turnOff")}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(connectDrawer, (ok) => ok && onPrefs({ ...prefs, drawer: true }))}
                        className="h-10 flex-1 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-foreground"
                    >
                        {t("till.drawer.connect")}
                    </button>
                )}
            </span>
        </div>
    );
}

type InstallPrompt = Event & { prompt: () => Promise<void> };

/** This device's till settings: text size, sound, small cards, and installing the till as an app. */
function TillSettings({
    prefs,
    onPrefs,
    onCount,
    onLabels,
    onScent,
    chip,
}: {
    prefs: TillPrefs;
    onPrefs: (p: TillPrefs) => void;
    onCount?: () => void;
    onLabels?: () => void;
    onScent?: () => void;
    chip: string;
}) {
    const { t } = useLanguage();
    const [install, setInstall] = useState<InstallPrompt | null>(null);
    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setInstall(e as InstallPrompt);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, []);
    const sizes: TextSize[] = ["normal", "large", "xl"];
    return (
        <Popover>
            <PopoverTrigger className={`${chip} px-3`} aria-label={t("till.settings.title")} title={t("till.settings.title")}>
                <Settings2 className="h-4 w-4" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-80 flex-col gap-4 rounded-2xl border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.settings.textSize")}</p>
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--card-border)]/30 p-1">
                        {sizes.map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => onPrefs({ ...prefs, textSize: size })}
                                aria-pressed={prefs.textSize === size}
                                className={`h-10 rounded-xl font-semibold ${prefs.textSize === size ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted"}`}
                                style={{ fontSize: `${13 * TEXT_ZOOM[size]}px` }}
                            >
                                {t(`till.settings.size.${size}`)}
                            </button>
                        ))}
                    </div>
                </div>
                <PrefSwitch
                    on={prefs.sound}
                    onChange={() => onPrefs({ ...prefs, sound: !prefs.sound })}
                    icon={prefs.sound ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                    label={t("till.settings.sound")}
                />
                <PrefSwitch
                    on={prefs.compact}
                    onChange={() => onPrefs({ ...prefs, compact: !prefs.compact })}
                    icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />}
                    label={t("till.settings.compact")}
                />
                {onCount && (
                    <button
                        type="button"
                        onClick={onCount}
                        className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                    >
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        {t("till.count.title")}
                    </button>
                )}
                {onLabels && (
                    <button
                        type="button"
                        onClick={onLabels}
                        className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                    >
                        <Tag className="h-4 w-4" aria-hidden="true" />
                        {t("till.labels.title")}
                    </button>
                )}
                {onScent && (
                    <button
                        type="button"
                        onClick={onScent}
                        className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                    >
                        <Wind className="h-4 w-4" aria-hidden="true" />
                        {t("till.scent.title")}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => window.open("/till/customer", "till-customer", "popup,width=1280,height=800")}
                    className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                >
                    <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                    {t("till.settings.customerScreen")}
                </button>
                <DrawerSetting prefs={prefs} onPrefs={onPrefs} />
                {install ? (
                    <button
                        type="button"
                        onClick={() => {
                            void install.prompt();
                            setInstall(null);
                        }}
                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-white dark:bg-[#EFFF00] dark:text-[#121212]"
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {t("till.settings.install")}
                    </button>
                ) : (
                    <p className="text-left text-xs text-muted" dir="auto">{t("till.settings.installHint")}</p>
                )}
            </PopoverContent>
        </Popover>
    );
}

/** One on/off row in the till settings. */
function PrefSwitch({ on, onChange, icon, label }: { on: boolean; onChange: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            type="button"
            onClick={onChange}
            role="switch"
            aria-checked={on}
            className="flex h-12 items-center justify-between rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
        >
            <span className="flex items-center gap-2">
                {icon}
                {label}
            </span>
            <span aria-hidden="true" className={cn("flex h-7 w-12 items-center rounded-full p-1 transition-colors", on ? "justify-end bg-[var(--ink)] dark:bg-[#EFFF00]" : "justify-start bg-stone-400 dark:bg-white/25")}>
                <span className="h-5 w-5 rounded-full bg-white shadow-sm dark:bg-zinc-900" />
            </span>
        </button>
    );
}
