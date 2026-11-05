import type { Metadata } from "next";
import { TillPage } from "@/components/till/till-page";

// Its own app manifest, so a shop's touch PC can install the till and open straight into it, full screen.
export const metadata: Metadata = {
    manifest: "/till.webmanifest",
};

export default function Page() {
    return <TillPage />;
}
