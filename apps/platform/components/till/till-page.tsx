"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Store } from "lucide-react";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useShops, useTillMembers, useTillRules, type Shop, type TillMember } from "@/hooks/use-shops";
import { lockTillSession, pingTillSession, saleErrorOf, useTillProducts, useTillSale, useTillStoreName } from "@/hooks/use-till";
import { addToCart, subtotalOf, type PaymentLine, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { printReceipt, receiptDocument, type ReceiptData } from "@/lib/till/receipt";
import { TillLockScreen } from "./till-lock-screen";
import { TillProductGrid } from "./till-product-grid";
import { TillCartPanel } from "./till-cart-panel";
import { TillPayView } from "./till-pay-view";
import { TillDoneView } from "./till-done-view";
import { newTicket, type Ticket } from "./till-ticket";

type Session = { id: string; cashier: TillMember };
type Done = { receipt: ReceiptData; phone: string | null; printed: boolean };

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
                    setDone({ receipt, phone, printed: print });
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
            <TillFrame title={t("till.lock.locked")} shopName={shop.name} onChangeShop={changeShop}>
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
            title={t(`till.top.${view}`)}
            shopName={shop.name}
            onChangeShop={changeShop}
            cashier={session.cashier.display_name}
            onLock={() => lock()}
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
                />
            ) : (
                <div className="flex min-h-0 flex-1">
                    <TillProductGrid products={products.data ?? []} loading={products.isPending} onAdd={add} />
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
                    />
                </div>
            )}
        </TillFrame>
    );
}

function TillFrame({
    title,
    shopName,
    onChangeShop,
    cashier,
    onLock,
    children,
}: {
    title: string;
    shopName?: string;
    onChangeShop?: () => void;
    cashier?: string;
    onLock?: () => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    const chip = "inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white";
    return (
        <div className="flex h-full flex-col bg-background">
            <header className="grid h-[64px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[#1E1E1E] px-4">
                <div className="flex items-center gap-2">
                    <Link href="/orders" className={chip} aria-label={t("till.top.exit")}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        {t("till.top.exit")}
                    </Link>
                    {shopName &&
                        (onChangeShop ? (
                            <button type="button" onClick={onChangeShop} className={chip}>
                                <Store className="h-4 w-4" aria-hidden="true" />
                                <span dir="auto">{shopName}</span>
                                <span className="text-xs font-normal text-white/60">· {t("till.top.change")}</span>
                            </button>
                        ) : (
                            <span className={chip}>
                                <Store className="h-4 w-4" aria-hidden="true" />
                                <span dir="auto">{shopName}</span>
                            </span>
                        ))}
                    {cashier && onLock && (
                        <button type="button" onClick={onLock} className={chip}>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E4C1F9] text-xs text-[#1E1E1E]">{cashier.slice(0, 1).toUpperCase()}</span>
                            <span dir="auto">{cashier}</span>
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-white/60">
                                · <Lock className="h-3 w-3" aria-hidden="true" /> {t("till.top.lock")}
                            </span>
                        </button>
                    )}
                </div>
                <h1 className="text-base font-bold text-white">{title}</h1>
                <div />
            </header>
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
    );
}
