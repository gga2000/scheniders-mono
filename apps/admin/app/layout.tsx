import type { Metadata } from "next";
import { headers } from "next/headers";
import { geistFontVars } from "./fonts/geist";
import "./globals.css";
import { Providers } from "@/components/providers";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { MENU_BEFORE_PAINT } from "@/lib/menu-choice";

// No title here: the console's top bar names each page's tab ("Wallets ·
// Scheniders Admin"), and a title set here would be written over it.
export const metadata: Metadata = {
  description: "Internal admin console for managing merchants, subscriptions, and billing",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The middleware's nonce for this response (lib/csp.ts): the only inline
  // script the policy lets run is one that carries it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={geistFontVars} className="antialiased">
        {/* Before the first paint: the desktop menu the person chose (lib/menu-choice.ts). */}
        {/* The browser hides a nonce from the page once it is read, so hydration sees none. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MENU_BEFORE_PAINT }} />
        <Providers>{children}</Providers>
        <WebAnalytics />
      </body>
    </html>
  );
}
