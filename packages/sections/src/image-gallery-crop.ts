// The proof stack's screenshot box (image_gallery `layout: "stack"`,
// spec §1.5). With the stored file's size known, the box keeps the
// picture's natural height and only the cropped width:
//   k = 1 − left − right (as fractions of the uncropped width)
//   box aspect-ratio = (width × k) / height
//   image width = 100 / k %, offset left −(left / k) %
// so the comment text keeps its size and nothing is cut at the bottom.
// The offset is a physical `left`: the document is always LTR. Without
// both sizes there is nothing to compute from: a 4/1 `fill` box, no crop.
// The image is 100 / k % of the column wide, so its `sizes` hint scales
// the column width and its cap by the same factor; a hint for the column
// alone made next/image pick a candidate too small for 2–3x screens.

/** The stack column: the viewport less the page gutters, capped at 600px. */
export const STACK_SIZES = "(max-width: 640px) calc(100vw - 2rem), 600px";

export type StackFrame =
  | { kind: "sized"; aspectRatio: string; imageWidth: string; imageLeft: string; sizes: string }
  | { kind: "fill" };

/** Two decimals, no trailing zeros (116.28, 12.5, 0). */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function stackFrame(img: {
  width?: number;
  height?: number;
  crop?: { left: number; right: number };
}): StackFrame {
  if (!img.width || !img.height) return { kind: "fill" };
  const left = img.crop?.left ?? 0;
  const right = img.crop?.right ?? 0;
  // Percent of the width kept: 20–100 (each side is capped at 40 by the schema).
  const kept = 100 - left - right;
  return {
    kind: "sized",
    aspectRatio: `${num((img.width * kept) / 100)} / ${img.height}`,
    imageWidth: `${num(10000 / kept)}%`,
    imageLeft: `${num((-left * 100) / kept)}%`,
    sizes:
      kept === 100
        ? STACK_SIZES
        : `(max-width: 640px) calc((100vw - 2rem) * 100 / ${num(kept)}), calc(600px * 100 / ${num(kept)})`,
  };
}
