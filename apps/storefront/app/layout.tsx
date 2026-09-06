import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Cairo,
  DM_Sans,
  Noto_Sans_Arabic,
} from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

// RC3: the Arabic-first brand face (scheniders_signature sets Cairo x4).
// Self-hosted through next/font so it is preloaded from our own origin with
// size-adjusted fallback metrics instead of a render-blocking Google CSS
// chain (CLS 0.14 on the home page). 800/900 are included because every
// section heading is `font-black`; the old Google URL capped at 700 and the
// browser synthesised the rest.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

// EC14: Arabic-capable fallback face. The Latin brand fonts (Bricolage /
// DM Sans) carry no Arabic glyphs, so ar/ku text would drop to the system
// font. Referenced last in every brand font stack (fontStack) and the tenant
// body cascade. next/font subsets it to the Arabic unicode-range, so
// Latin-only stores never download it.
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scheniders Storefront",
  description: "E-commerce storefronts powered by Scheniders Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      className={`${bricolage.variable} ${dmSans.variable} ${cairo.variable} ${notoSansArabic.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Pin the variable icon font to the one instance actually used
            (wght 400, FILL 1 — see globals.css) rather than the full
            100..700 / 0..1 axis ranges; far smaller download. The preconnect
            above warms the connection so this render-blocking stylesheet
            resolves fast. `display=block`, not `swap`: this is a ligature
            font, so swapping in a fallback paints the icon NAMES
            ("shopping_bag") as text until the face arrives — a short
            invisible period is the correct trade for an icon font. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,1&display=block"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
