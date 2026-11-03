import type { Metadata } from "next";
import { brandFontVars } from "./fonts/brand-fonts";
import "./globals.css";
import { ICON_FONT_SUBSET_HREF } from "@scheniders/sections/helpers/icon-names";

export const metadata: Metadata = {
  title: "Scheniders Storefront",
  description: "E-commerce storefronts powered by Scheniders Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" style={brandFontVars}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Pin the variable icon font to the one instance actually used
            (wght 400, FILL 1 — see globals.css) and to the icon names the
            storefront ships (helpers/icon-names.ts) rather than the whole
            font; far smaller download. An icon outside the list loads the
            full font on demand (MaterialIcon). The preconnect
            above warms the connection so this render-blocking stylesheet
            resolves fast. `display=block`, not `swap`: this is a ligature
            font, so swapping in a fallback paints the icon NAMES
            ("shopping_bag") as text until the face arrives — a short
            invisible period is the correct trade for an icon font. */}
        <link
          rel="stylesheet"
          href={ICON_FONT_SUBSET_HREF}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
