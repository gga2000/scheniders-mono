import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Scheniders Storefront",
  description: "E-commerce storefronts powered by Scheniders Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" className={`${bricolage.variable} ${dmSans.variable}`}>
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
            resolves fast (font is then ready by first paint). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,1&display=swap"
        />
        {/* EC14: Arabic-capable fallback face. The Latin brand fonts
            (Bricolage / DM Sans) carry no Arabic glyphs, so ar/ku text would
            drop to the system font. Referenced last in the brand font stacks
            (fontStack) and the tenant body cascade; the browser only fetches
            the woff2 for glyphs in the Arabic unicode-range, so Latin-only
            stores never download it. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
