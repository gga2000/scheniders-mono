import { beforeEach, describe, expect, it, vi } from "vitest";

/** The guarded fetch is proven in packages/shared/src/public-fetch.test.ts; here each link's answer is set. */
const web = vi.hoisted(() => ({
  publicLink: true,
  answer: null as Response | null,
  asked: [] as Array<{ url: string; maxRedirects: number; accept: string | undefined }>,
}));
vi.mock("@scheniders/shared/public-fetch", async (orig) => {
  const real = await orig<typeof import("@scheniders/shared/public-fetch")>();
  return {
    ...real,
    validatePublicUrl: async (raw: string) => (web.publicLink ? new URL(raw) : null),
    fetchPublic: async (url: URL, options: { maxRedirects: number; headers: Record<string, string> }) => {
      web.asked.push({ url: url.toString(), maxRedirects: options.maxRedirects, accept: options.headers.accept });
      return web.answer ? { res: web.answer, url } : null;
    },
  };
});

import { IMAGE_MAX_BYTES, fetchImage, imageKind } from "./product-import-images";

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const bytes = (head: number[], size = 64): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  return out;
};
const answer = (body: Uint8Array<ArrayBuffer> | null, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

beforeEach(() => {
  web.publicLink = true;
  web.answer = null;
  web.asked = [];
});

describe("imageKind", () => {
  it("knows the four kinds the bucket takes by their first bytes, and nothing else", () => {
    expect(imageKind(bytes(JPEG))).toEqual({ type: "image/jpeg", ext: "jpg" });
    expect(imageKind(bytes(PNG))).toEqual({ type: "image/png", ext: "png" });
    expect(imageKind(bytes(WEBP))).toEqual({ type: "image/webp", ext: "webp" });
    expect(imageKind(bytes(GIF))).toEqual({ type: "image/gif", ext: "gif" });
    expect(imageKind(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
    expect(imageKind(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    // RIFF that is not WebP (a WAV sound).
    expect(imageKind(bytes([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    expect(imageKind(new Uint8Array(0))).toBeNull();
  });
});

describe("fetchImage", () => {
  it("answers the image a link gives, whatever type its server claims", async () => {
    web.answer = answer(bytes(PNG, 2000));
    const got = await fetchImage("https://cdn.example/a.png");
    expect(got).toMatchObject({ ok: true, kind: { type: "image/png", ext: "png" } });
    expect(got.ok && got.bytes.length).toBe(2000);
    expect(web.asked).toEqual([{ url: "https://cdn.example/a.png", maxRedirects: 3, accept: expect.stringContaining("image/") }]);
  });

  it("says why a link gives no image", async () => {
    web.publicLink = false;
    expect(await fetchImage("http://10.0.0.1/a.jpg")).toEqual({ ok: false, reason: "The link is not a public web link" });
    expect(web.asked).toHaveLength(0);

    web.publicLink = true;
    expect(await fetchImage("https://cdn.example/a.jpg")).toEqual({ ok: false, reason: "The link did not open" });

    web.answer = answer(bytes(JPEG), 404);
    expect(await fetchImage("https://cdn.example/a.jpg")).toEqual({ ok: false, reason: "The link answered 404" });

    web.answer = answer(bytes(JPEG, IMAGE_MAX_BYTES + 1));
    expect(await fetchImage("https://cdn.example/a.jpg")).toEqual({ ok: false, reason: "The image is bigger than 5 MB" });

    web.answer = answer(new TextEncoder().encode("<html>sign in to see this photo</html>"));
    expect(await fetchImage("https://drive.example/view")).toEqual({ ok: false, reason: "The link is not a JPEG, PNG, WebP or GIF image" });
  });
});
