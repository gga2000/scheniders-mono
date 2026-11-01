import type { ReactNode } from "react";

/** /reports reads its own server aggregates (see useReportOrders), not the shared order book. */
export default function ReportsLayout({ children }: { children: ReactNode }) {
    return children;
}
