// Chrome strings for image_gallery's whole-picture viewer, shared by the
// whole carousel (image_gallery.tsx) and the proof stack
// (image_gallery.proofstack.tsx). `{n}` / `{total}` / `{alt}` are filled
// on the server. Kurdish falls back to Arabic. Kept in a plain module: a
// value exported from the "use client" viewer would reach a server import
// as a reference proxy, not the strings.

export const VIEWER_STRINGS = {
  ar: {
    open: "كبّر الصورة {n} من {total}",
    openNamed: "كبّر الصورة: {alt}",
    viewer: "عرض الصور",
    prev: "الصورة السابقة",
    next: "الصورة التالية",
    counter: "{n} من {total}",
  },
  en: {
    open: "Enlarge image {n} of {total}",
    openNamed: "Enlarge image: {alt}",
    viewer: "Image viewer",
    prev: "Previous image",
    next: "Next image",
    counter: "{n} of {total}",
  },
} as const;

export function fillCount(template: string, n: number, total: number): string {
  return template.replace("{n}", String(n)).replace("{total}", String(total));
}

/** A function replacer, so `$&` / `$1` in merchant text stay literal. */
export function fillAlt(template: string, alt: string): string {
  return template.replace("{alt}", () => alt);
}
