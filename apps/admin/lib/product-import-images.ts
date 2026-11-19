import { fetchPublic, readCapped, validatePublicUrl } from "@scheniders/shared/public-fetch";

/**
 * Fetches a product image from a link in the merchant's file (Fermi B12
 * item 7) so it can be saved in the shop's own storage: the storefront shows
 * images from there only. The fetch reaches the public internet only
 * (@scheniders/shared/public-fetch), and what comes back must really be a
 * JPEG, PNG, WebP or GIF, by its first bytes, whatever the link's server
 * says it is: those are the kinds the product-images bucket takes.
 */

/** The product-images bucket's own cap. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export interface ImageKind {
  type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  ext: "jpg" | "png" | "webp" | "gif";
}

const starts = (bytes: Uint8Array, at: number, sig: readonly number[]) => sig.every((b, i) => bytes[at + i] === b);

/** The image kind its first bytes say, or null for anything else (a web page, a PDF, an HEIC photo). */
export function imageKind(bytes: Uint8Array): ImageKind | null {
  if (starts(bytes, 0, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (starts(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", ext: "png" };
  if (starts(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return { type: "image/webp", ext: "webp" };
  if (starts(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return { type: "image/gif", ext: "gif" };
  return null;
}

export type FetchedImage = { ok: true; bytes: Uint8Array; kind: ImageKind } | { ok: false; reason: string };

/** One image from a link, or why it could not be had, in words staff can act on. */
export async function fetchImage(link: string): Promise<FetchedImage> {
  const url = await validatePublicUrl(link);
  if (!url) return { ok: false, reason: "The link is not a public web link" };
  const fetched = await fetchPublic(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    maxRedirects: MAX_REDIRECTS,
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; FermiProductImport/1.0)" },
  });
  if (!fetched) return { ok: false, reason: "The link did not open" };
  if (fetched.res.status !== 200) {
    await fetched.res.body?.cancel().catch(() => {});
    return { ok: false, reason: `The link answered ${fetched.res.status}` };
  }
  const bytes = await readCapped(fetched.res, IMAGE_MAX_BYTES, "refuse");
  if (bytes === "too_big") return { ok: false, reason: "The image is bigger than 5 MB" };
  if (bytes === null) return { ok: false, reason: "The link did not open" };
  const kind = imageKind(bytes);
  if (!kind) return { ok: false, reason: "The link is not a JPEG, PNG, WebP or GIF image" };
  return { ok: true, bytes, kind };
}
