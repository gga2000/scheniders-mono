"use client";

import { createContext, useContext, ReactNode } from "react";
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
    const ordersData = useOrders();

    return (
        <OrdersContext.Provider value={ordersData}>
            {children}
        </OrdersContext.Provider>
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

export { OrdersContext };
