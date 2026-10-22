/**
 * The part of a `next/font` result this module reads. Structural, so the
 * shared package does not depend on Next.
 */
export interface SelfHostedFontFace {
  readonly style: { readonly fontFamily: string };
}

/**
 * One family self-hosted with `next/font/local` as several faces, one per
 * Google Fonts subset file (latin, latin-ext, arabic…), each limited to its
 * subset by a `unicode-range` declaration. The browser downloads a face only
 * when the page has a character in its range, so a Latin-only page never
 * fetches the Arabic file.
 *
 * `next/font/local` applies one set of declarations to every file of a call,
 * so each subset needs its own call, and each call gets its own family name.
 * This joins them into the single `font-family` stack the family's CSS
 * variable holds.
 *
 * `faces` is in priority order: on a code point two ranges share, the first
 * face wins. Next formats `style.fontFamily` as the face's family followed by
 * its size-adjusted fallback (`'face', 'face Fallback'`) when the call has
 * one. The fallbacks are moved after every face: the fallback is a local
 * Arial, which has Arabic glyphs on Windows and macOS, so left beside the
 * Latin face it would render Arabic text before the Arabic face was tried.
 */
export function subsetFontStack(faces: readonly SelfHostedFontFace[]): string {
  if (faces.length === 0) {
    throw new Error("subsetFontStack needs at least one face");
  }
  const families = faces.map((face) =>
    face.style.fontFamily.split(",").map((name) => name.trim()),
  );
  const primaries = families.map(([primary]) => primary);
  const fallbacks = new Set(families.flatMap(([, ...rest]) => rest));
  return [...primaries, ...fallbacks].join(", ");
}
