import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Cairo,
  DM_Sans,
  Noto_Sans_Arabic,
} from "next/font/google";
import "./globals.css";

// All four families are VARIABLE fonts on Google Fonts, so no `weight` list:
// next/font then requests the variable axis and gets one woff2 per subset that
// covers every weight. Asking for discrete weights of a variable family makes
// Google answer with `/l/font?kit=…&skey=…&v=…` URLs instead, and Turbopack's
// font replacer asserts the query has exactly one entry — the build fails with
// "next/font/google queries have exactly one entry" (vercel/next.js#99114).
// Google does not serve that shape on every request, which is why it surfaced
// as an intermittently red CI and a dev server that 500s on every page.

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

// RC3: the Arabic-first brand face (scheniders_signature sets Cairo x4).
// Self-hosted through next/font so it is preloaded from our own origin with
// size-adjusted fallback metrics instead of a render-blocking Google CSS
// chain (CLS 0.14 on the home page). The variable axis runs 200–1000, so the
// 800/900 every `font-black` section heading uses are real weights, not
// browser-synthesised ones.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
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
