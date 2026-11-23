import localFont from "next/font/local";

// Baloo Bhaijaan 2, Arabic subset only: Fermi's display face (the same file
// usefermi.com serves), self-hosted like Geist. Latin text in the same
// element falls through to Geist. Imported only by the pages that use it,
// so no other page downloads it.
export const balooArabic = localFont({
    src: "./baloo/arabic.woff2",
    weight: "400 800",
    display: "swap",
    variable: "--font-fermi-display",
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC",
        },
    ],
});
