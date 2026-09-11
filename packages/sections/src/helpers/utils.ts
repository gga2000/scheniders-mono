// `cn` lives in @scheniders/shared — re-export so internal helpers/sections
// can import it from a single stable path.
export { cn } from "@scheniders/shared";

/** Press/hover feedback for tappable cards and links. Touch has no hover,
 *  so the `active:` step is what makes the primary device feel alive.
 *  Lives here (not in `primitives.tsx`) because that module is "use client":
 *  a plain string exported from a client module turns into an opaque client
 *  reference when a server-rendered section imports it. */
export const PRESSABLE =
  "transition-[transform,box-shadow,opacity] duration-150 motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]";
