import type { Metadata } from "next";
import { TillCustomerScreen } from "@/components/till/till-customer-screen";

export const metadata: Metadata = { title: "Customer screen" };

export default function Page() {
    return <TillCustomerScreen />;
}
