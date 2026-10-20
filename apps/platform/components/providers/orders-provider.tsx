"use client";

import { createContext, useContext, ReactNode } from "react";
import { useOrders } from "@/hooks/use-orders";
import type { Order } from "@/types/order";

/**
 * The order book: the /orders date window (default: today), and everything that
 * runs on it — its realtime channel, the server aggregates for the active filter,
 * reference data, duplicate alerts and the CRUD that patches it.
 *
 * MOUNTED PER ROUTE, NOT IN THE ROOT LAYOUT. It used to wrap the whole app, so
 * every route paid for the window fetch, the aggregates RPC and a realtime
 * channel, including the dashboard and settings pages that never show an order.
 * A route opts in by rendering <OrdersProvider> in its own layout (or page):
 *
 *   /orders, /finances, /printing, /analytics, /reports, /products (list)
 *
 * The root layout's own chrome (top bar search, chat) sits ABOVE those layouts,
 * so it can never see a book and reads orders from the server instead.
 *
 * One provider per route keeps a single subscription per page. The window itself
 * lives in the React Query cache under `orderKeys.lists()`, so moving between two
 * book routes reuses it instead of refetching from nothing.
 */

type OrdersContextType = ReturnType<typeof useOrders>;

const OrdersContext = createContext<OrdersContextType | null>(null);

interface OrdersProviderProps {
    children: ReactNode;
}

export function OrdersProvider({ children }: OrdersProviderProps) {
    const ordersData = useOrders();

    return (
        <OrdersContext.Provider value={ordersData}>
            {children}
        </OrdersContext.Provider>
    );
}

/**
 * The order book of the current route. Throws outside an <OrdersProvider>: a
 * component that needs the book on a route that has not opted in must fail
 * loudly, not render an empty list as if the merchant had no orders.
 */
export function useOrdersContext(): OrdersContextType {
    const context = useContext(OrdersContext);

    if (context === null) {
        throw new Error(
            "useOrdersContext must be used within <OrdersProvider>. The order book is " +
            "mounted per route: render <OrdersProvider> in this route's layout, or read " +
            "the orders this component needs from the server instead."
        );
    }

    return context;
}

/**
 * The loaded window when this tree has a book mounted, `null` when it has not.
 *
 * For code shared between book routes and others that can use the window when it
 * is there and has a correct answer when it is not. `null` is not "no orders":
 * a caller must not treat it as an empty list.
 */
export function useLoadedOrders(): Order[] | null {
    return useContext(OrdersContext)?.orders ?? null;
}
