import type { ReactNode } from "react";
import { OrdersProvider } from "@/components/providers/orders-provider";

/** /printing reads the order book, which each route that needs it mounts (see OrdersProvider). */
export default function PrintingLayout({ children }: { children: ReactNode }) {
    return <OrdersProvider>{children}</OrdersProvider>;
}
