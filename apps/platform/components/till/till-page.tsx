"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Lock, Receipt, Settings2, Store, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useShops, useTillMembers, useTillRules, type Shop, type TillMember } from "@/hooks/use-shops";
import { lockTillSession, pingTillSession, saleErrorOf, useTillOverview, useTillProducts, useTillSale, useTillStoreName } from "@/hooks/use-till";
import { addToCart, dateLocale, formatIqd, subtotalOf, type CartLine, type PaymentLine, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { readPrefs, TEXT_ZOOM, writePrefs, type TextSize, type TillPrefs } from "@/lib/till/prefs";
import { printReceipt, receiptDocument, type ReceiptData } from "@/lib/till/receipt";
import { TillLockScreen } from "./till-lock-screen";
import { TillProductGrid } from "./till-product-grid";
import { TillCartPanel } from "./till-cart-panel";
import { TillPayView } from "./till-pay-view";
import { TillDoneView } from "./till-done-view";
import { TillHistoryDialog } from "./till-history-dialog";
import { newTicket, type Ticket } from "./till-ticket";

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
    // The till renders only after its queries load, never during the server pass, so reading storage here is safe.
    const [prefs, setPrefsState] = useState<TillPrefs>(readPrefs);
    const setPrefs = (next: TillPrefs) => {
        setPrefsState(next);
        writePrefs(next);
    };
    const overview = useTillOverview(session?.id ?? null);

    const ticket = tickets.find((x) => x.id === activeId) ?? tickets[0];

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
                lines: ticket.cart.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })),
                discount: ticket.discount,
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
                    if (why === "locked") lock(t("till.lock.timedOut"));
                    else toast({ title: t(`till.sale.error.${why}`), variant: "error" });
                },
            },
        );
    };

    if (shops.isPending || members.isPending) {
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
            onHistory={() => setHistoryOpen(true)}
            prefs={prefs}
            onPrefs={setPrefs}
        >
            {view === "pay" ? (
                <TillPayView
                    ticket={ticket}
                    total={Math.max(0, subtotalOf(ticket.cart) - ticket.discount)}
                    pending={sale.isPending}
                    print={print}
                    onPrint={setPrint}
                    hasPhone={!!ticket.phone.trim() && !!normalizeIraqiMobile(ticket.phone)}
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
                    <TillProductGrid products={products.data ?? []} loading={products.isPending} overview={overview.data} sound={prefs.sound} onAdd={add} />
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
                    />
                </div>
            )}
            {historyOpen && <TillHistoryDialog sessionId={session.id} shop={shop} storeName={storeName.data ?? ""} onClose={() => setHistoryOpen(false)} />}
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
    prefs,
    onPrefs,
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
    prefs?: TillPrefs;
    onPrefs?: (p: TillPrefs) => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    const chip = "inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10";
    const zoom = TEXT_ZOOM[prefs?.textSize ?? "normal"];
    return (
        <div className="till-screen flex h-full flex-col bg-background" style={zoom === 1 ? undefined : { zoom }}>
            <header className="grid h-[64px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[#1E1E1E] px-4">
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
                            <span dir="auto" className="max-w-[140px] truncate">{cashier}</span>
                            <Lock className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {title ? <h1 className="text-base font-bold text-white">{title}</h1> : <TillClock />}
                <div className="flex items-center justify-end gap-2">
                    {today && onHistory && (
                        <button type="button" onClick={onHistory} className={chip} title={t("till.history.title")}>
                            <Receipt className="h-4 w-4" aria-hidden="true" />
                            <span className="tabular-nums">{formatIqd(today.total)}</span>
                            <span className="text-xs font-medium tabular-nums text-white/60" dir="auto">
                                {t("till.top.today", { n: today.count })}
                            </span>
                            {mine && mine.count > 0 && mine.count !== today.count && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium tabular-nums text-white/80" dir="auto">
                                    {t("till.top.mine", { n: mine.count })}
                                </span>
                            )}
                        </button>
                    )}
                    {prefs && onPrefs && <TillSettings prefs={prefs} onPrefs={onPrefs} chip={chip} />}
                </div>
            </header>
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
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
        <p className="flex items-baseline gap-2 text-white">
            <span className="text-xl font-bold tabular-nums">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}</span>
            <span className="text-xs font-medium text-white/60">{now.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Baghdad" })}</span>
        </p>
    );
}

type InstallPrompt = Event & { prompt: () => Promise<void> };

/** This device's till settings: text size, sound, and installing the till as an app. */
function TillSettings({ prefs, onPrefs, chip }: { prefs: TillPrefs; onPrefs: (p: TillPrefs) => void; chip: string }) {
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
            <PopoverContent align="end" className="flex w-72 flex-col gap-4 rounded-2xl p-4">
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
                <button
                    type="button"
                    onClick={() => onPrefs({ ...prefs, sound: !prefs.sound })}
                    aria-pressed={prefs.sound}
                    className="flex h-12 items-center justify-between rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                >
                    <span className="flex items-center gap-2">
                        {prefs.sound ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                        {t("till.settings.sound")}
                    </span>
                    <span className="text-xs text-muted">{prefs.sound ? t("till.settings.on") : t("till.settings.off")}</span>
                </button>
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
