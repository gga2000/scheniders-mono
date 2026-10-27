// The express column's side gutter, in one place. The column pads by
// `pad`; the note row bleeds back out by the same amount (`bleed`) so it
// scrolls edge to edge while its first card still lines up with the column.
// Full literal class names, so Tailwind's source scan finds them.
export const EXPRESS_GUTTER = {
  pad: "px-4",
  bleed: "-mx-4 px-4 scroll-px-4",
} as const;
