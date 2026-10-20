import type { ReactNode } from "react";
import { OrdersProvider } from "@/components/providers/orders-provider";

/** /analytics reads the order book, which each route that needs it mounts (see OrdersProvider). */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
    return <OrdersProvider>{children}</OrdersProvider>;
}
