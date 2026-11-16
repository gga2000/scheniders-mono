/**
 * Text colour for a letter painted on a shop's own brand colour: white or
 * near-black, whichever reads better (WCAG 2.x contrast). A shop can pick
 * any colour, so a fixed white letter disappears on yellow or pale pink.
 */
const LIGHT = "#ffffff";
const DARK = "#1e1e1e";

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function inkOn(background: string): typeof LIGHT | typeof DARK {
  const l = luminance(background);
  if (l === null) return LIGHT;
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (0.0137 + 0.05);
  return onWhite >= onDark ? LIGHT : DARK;
}
