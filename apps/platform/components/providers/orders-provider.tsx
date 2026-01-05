"use client";

import { createContext, useContext, ReactNode } from "react";
import { useOrders } from "@/hooks/use-orders";
import { Order, OrderFilters, RejectionReason, MessageTemplate, FilterPreset, FollowUpReminder } from "@/lib/supabase";

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
 * If used outside of OrdersProvider, it falls back to useOrders().
 */
export function useOrdersContext(): OrdersContextType {
    const context = useContext(OrdersContext);

    // If no provider found, fall back to direct useOrders call
    // This allows gradual migration and prevents breaking changes
    if (context === null) {
        console.warn(
            "useOrdersContext called outside OrdersProvider. " +
            "Falling back to direct useOrders() call. " +
            "Wrap your app with <OrdersProvider> to fix duplicate subscriptions."
        );
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useOrders();
    }

    return context;
}

export { OrdersContext };
