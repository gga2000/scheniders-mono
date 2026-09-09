"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useOrders } from "@/hooks/use-orders";
/**
 * OrdersContext - Provides shared orders state to prevent duplicate subscriptions
 * 
 * PROBLEM SOLVED:
 * Previously, each component calling useOrders() created its own Supabase
 * subscription and fetched all orders independently. This caused:
 * - Multiple parallel network requests
 * - Wasted bandwidth and memory
 * - Potential race conditions
 * 
 * SOLUTION:
 * This context wraps the app and provides a single source of truth for orders.
 * Components use useOrdersContext() instead of useOrders() directly.
 */

// Define the context type based on useOrders return type
type OrdersContextType = ReturnType<typeof useOrders>;

/** Separate context so subscribing does not re-render on every orders change. */
const OrdersListGate = createContext<(() => () => void) | null>(null);

const OrdersContext = createContext<OrdersContextType | null>(null);

interface OrdersProviderProps {
    children: ReactNode;
}

/**
 * OrdersProvider - Wrap your app with this to share orders state
 * 
 * Usage in layout.tsx:
 * <OrdersProvider>
 *   {children}
 * </OrdersProvider>
 */
export function OrdersProvider({ children }: OrdersProviderProps) {
    // PERF-D1. This provider is mounted in the ROOT layout, so it used to fetch
    // the whole order book on every route in the app — ~7 MB on the largest
    // tenant, for routes that never show an order. The fetch is now opt-in:
    // it runs only while at least one mounted component has called
    // useOrdersList().
    const [listSubscribers, setListSubscribers] = useState(0);

    const subscribeToList = useCallback(() => {
        setListSubscribers((n) => n + 1);
        return () => setListSubscribers((n) => n - 1);
    }, []);

    const ordersData = useOrders({ listEnabled: listSubscribers > 0 });

    return (
        <OrdersListGate.Provider value={subscribeToList}>
            <OrdersContext.Provider value={ordersData}>
                {children}
            </OrdersContext.Provider>
        </OrdersListGate.Provider>
    );
}

/**
 * useOrdersContext - Use this instead of useOrders() in components
 * 
 * This returns the shared orders state from the context.
 * Must be used within an <OrdersProvider>.
 */
export function useOrdersContext(): OrdersContextType {
    const context = useContext(OrdersContext);

    if (context === null) {
        throw new Error(
            "useOrdersContext must be used within <OrdersProvider>. " +
            "Wrap your component tree with <OrdersProvider> in layout.tsx."
        );
    }

    return context;
}

/**
 * useOrdersList - use this when you need the ORDER LIST itself.
 *
 * Subscribing is what triggers the fetch. `useOrdersContext()` stays available
 * for components that only need actions (createOrder, filters, blacklist…) and
 * must not pull the book down with them.
 */
export function useOrdersList(): OrdersContextType {
    const subscribe = useContext(OrdersListGate);
    useEffect(() => {
        if (!subscribe) return;
        return subscribe();
    }, [subscribe]);

    if (subscribe === null) {
        throw new Error(
            "useOrdersList must be used within <OrdersProvider>. " +
            "Wrap your component tree with <OrdersProvider> in layout.tsx."
        );
    }
    return useOrdersContext();
}

export { OrdersContext, OrdersListGate };
