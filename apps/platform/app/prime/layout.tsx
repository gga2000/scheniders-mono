import type { ReactNode } from "react";
import { OrdersProvider } from "@/components/providers/orders-provider";

/** /prime edits orders in place (the resend form saves its fixes through the order book), so it mounts the book (see OrdersProvider). */
export default function PrimeLayout({ children }: { children: ReactNode }) {
    return <OrdersProvider>{children}</OrdersProvider>;
}
