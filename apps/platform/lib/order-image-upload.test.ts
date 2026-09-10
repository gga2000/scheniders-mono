import { describe, it, expect } from "vitest";
import {
    validateImageUpload,
    normalizeMimeType,
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_BYTES,
} from "./order-image-upload";

const file = (type: string, size: number) => ({ type, size });

describe("normalizeMimeType", () => {
    it("drops parameters and casing that browsers add", () => {
        expect(normalizeMimeType("Image/JPEG; charset=binary")).toBe("image/jpeg");
        expect(normalizeMimeType("  image/png  ")).toBe("image/png");
    });

    it("returns an empty string for anything that is not a string", () => {
        expect(normalizeMimeType(undefined)).toBe("");
        expect(normalizeMimeType(null)).toBe("");
        expect(normalizeMimeType(42)).toBe("");
    });
});

describe("validateImageUpload", () => {
    it("accepts every allowed type", () => {
        for (const type of ALLOWED_IMAGE_MIME_TYPES) {
            const result = validateImageUpload(file(type, 1024));
            expect(result.ok, type).toBe(true);
        }
    });

    it("reports a missing field as 400 rather than crashing", () => {
        expect(validateImageUpload(null)).toMatchObject({ ok: false, status: 400 });
        expect(validateImageUpload(undefined)).toMatchObject({ ok: false, status: 400 });
        // A plain text field submitted under the image key.
        expect(validateImageUpload("not-a-file")).toMatchObject({ ok: false, status: 400 });
    });

    it("rejects an empty file", () => {
        expect(validateImageUpload(file("image/png", 0))).toMatchObject({ ok: false, status: 400 });
    });

    it("rejects an oversized body with 413, before it reaches Gemini", () => {
        const result = validateImageUpload(file("image/jpeg", MAX_IMAGE_BYTES + 1));
        expect(result).toMatchObject({ ok: false, status: 413 });
        if (!result.ok) expect(result.error).toContain("8 MB");
    });

    it("accepts a file exactly at the limit", () => {
        expect(validateImageUpload(file("image/jpeg", MAX_IMAGE_BYTES)).ok).toBe(true);
    });

    it("rejects a disallowed type with 415", () => {
        expect(validateImageUpload(file("application/pdf", 1024))).toMatchObject({
            ok: false,
            status: 415,
        });
        expect(validateImageUpload(file("image/svg+xml", 1024))).toMatchObject({
            ok: false,
            status: 415,
        });
        expect(validateImageUpload(file("text/html", 1024))).toMatchObject({
            ok: false,
            status: 415,
        });
    });

    it("rejects a missing type rather than defaulting to one", () => {
        expect(validateImageUpload(file("", 1024))).toMatchObject({ ok: false, status: 415 });
        expect(validateImageUpload({ size: 1024 })).toMatchObject({ ok: false, status: 400 });
    });

    it("returns the normalized type so the route never forwards the raw header", () => {
        const result = validateImageUpload(file("IMAGE/JPEG; charset=binary", 2048));
        expect(result).toEqual({ ok: true, mimeType: "image/jpeg", size: 2048 });
    });

    it("rejects a non-numeric size", () => {
        expect(validateImageUpload({ type: "image/png", size: "big" })).toMatchObject({
            ok: false,
            status: 400,
        });
    });
});
