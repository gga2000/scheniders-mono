/**
 * Validation for the order-image analysis upload.
 *
 * The route forwards whatever it is given to Gemini, so the boundary has to be
 * checked here: an unbounded body is read fully into memory and then billed to
 * the Gemini account, and a client-declared MIME type is passed straight
 * through to the model.
 */

/**
 * Image types Gemini accepts for inline image data, intersected with what the
 * order-capture UI can actually produce (`accept="image/*"` from a camera or
 * file picker).
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Largest upload accepted, in bytes.
 *
 * Gemini's inline-data path is the constraint: the image is base64-encoded,
 * which inflates it by about a third, and the request as a whole must stay
 * under the model's inline limit. 8 MB of source image is comfortably inside
 * that and is far above a phone photo of a receipt, which is what this feature
 * actually receives.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageUploadRejection =
    | { ok: false; status: 400; error: string }
    | { ok: false; status: 413; error: string }
    | { ok: false; status: 415; error: string };

export type ImageUploadValidation =
    | { ok: true; mimeType: AllowedImageMimeType; size: number }
    | ImageUploadRejection;

/** Shape we need from a multipart field; `File` in the route, plain in tests. */
export type UploadedFileLike = {
    type?: unknown;
    size?: unknown;
};

function isFileLike(value: unknown): value is UploadedFileLike {
    return typeof value === "object" && value !== null && "size" in value && "type" in value;
}

/** Strip any `; charset=` or similar parameter before comparing. */
export function normalizeMimeType(raw: unknown): string {
    if (typeof raw !== "string") return "";
    return raw.split(";")[0].trim().toLowerCase();
}

/**
 * Check a multipart upload before any of it reaches Gemini.
 *
 * Returns the status the route should answer with, so an oversized body is a
 * 413 and an unsupported type is a 415 rather than both surfacing as a 500 from
 * somewhere deeper.
 */
export function validateImageUpload(value: unknown): ImageUploadValidation {
    if (!isFileLike(value)) {
        return { ok: false, status: 400, error: "No image provided" };
    }

    const size = typeof value.size === "number" ? value.size : Number.NaN;
    if (!Number.isFinite(size) || size <= 0) {
        return { ok: false, status: 400, error: "Image is empty" };
    }
    if (size > MAX_IMAGE_BYTES) {
        return {
            ok: false,
            status: 413,
            error: `Image is too large. The limit is ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
        };
    }

    const mimeType = normalizeMimeType(value.type);
    if (!mimeType) {
        return { ok: false, status: 415, error: "Image type is missing" };
    }
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
        return {
            ok: false,
            status: 415,
            error: `Unsupported image type. Allowed: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`,
        };
    }

    return { ok: true, mimeType: mimeType as AllowedImageMimeType, size };
}
