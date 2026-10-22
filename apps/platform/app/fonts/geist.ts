import localFont from "next/font/local";
import { subsetFontStack, type FontVariables } from "@scheniders/shared/font-stack";

// Geist and Geist Mono, self-hosted. The woff2 files beside this module are
// the exact subset files Google Fonts serves for these families (fetched
// from fonts.gstatic.com with the user agent next/font/google uses),
// committed with each family's OFL licence. They used to be downloaded by
// next/font/google during `next build`, where one failed fetch failed the
// build.
//
// Each Google subset is its own call with Google's own unicode-range (one
// set of declarations applies to every file of a next/font/local call), so
// the browser fetches a file only for the characters a page has.
// subsetFontStack joins a family's calls into the one stack its CSS variable
// holds. Calls are in stack order: the reverse of Google's CSS, because there
// the last-declared face wins a shared code point while in a stack the first
// one does. Only the Latin call carries the size-adjusted fallback.
// `preload` is on for exactly the subsets the old `subsets` option named.


// Geist: the UI face (was `subsets: ["latin"], preload: true`).

const geistSansLatin = localFont({
  src: "./geist/latin.woff2",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const geistSansLatinExt = localFont({
  src: "./geist/latin-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const geistSansVietnamese = localFont({
  src: "./geist/vietnamese.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" }],
});
const geistSansCyrillic = localFont({
  src: "./geist/cyrillic.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});
const geistSansCyrillicExt = localFont({
  src: "./geist/cyrillic-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});


// Geist Mono (was `subsets: ["latin"], preload: false`).

const geistMonoLatin = localFont({
  src: "./geist-mono/latin.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const geistMonoLatinExt = localFont({
  src: "./geist-mono/latin-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const geistMonoVietnamese = localFont({
  src: "./geist-mono/vietnamese.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" }],
});
const geistMonoSymbols2 = localFont({
  src: "./geist-mono/symbols2.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+2000-2001, U+2004-2008, U+200A, U+23B8-23BD, U+2500-259F" }],
});
const geistMonoCyrillic = localFont({
  src: "./geist-mono/cyrillic.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});
const geistMonoCyrillicExt = localFont({
  src: "./geist-mono/cyrillic-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});


/**
 * `--font-geist-sans` / `--font-geist-mono`, set on `<body>`; read by
 * tailwind.config.ts and @scheniders/ui tokens.css.
 */
export const geistFontVars: FontVariables = {
  "--font-geist-sans": subsetFontStack([
    geistSansLatin,
    geistSansLatinExt,
    geistSansVietnamese,
    geistSansCyrillic,
    geistSansCyrillicExt,
  ]),
  "--font-geist-mono": subsetFontStack([
    geistMonoLatin,
    geistMonoLatinExt,
    geistMonoVietnamese,
    geistMonoSymbols2,
    geistMonoCyrillic,
    geistMonoCyrillicExt,
  ]),
};
