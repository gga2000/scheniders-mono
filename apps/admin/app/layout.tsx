import type { Metadata } from "next";
import { geistFontVars } from "./fonts/geist";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Scheniders Admin",
  description: "Internal admin console for managing merchants, subscriptions, and billing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={geistFontVars} className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
