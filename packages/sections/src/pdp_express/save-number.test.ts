// «احفظ رقمنا» (F01): which way the number is saved on each device, and
// what the buyer is told afterwards. Never "saved": the page cannot know.

import { describe, expect, it, vi } from "vitest";
import { pickSaveRoute, shareOrCopy } from "./save-number";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const env = (userAgent: string, over: Partial<Parameters<typeof pickSaveRoute>[0]> = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  canShareFile: true,
  hasClipboard: true,
  ...over,
});

describe("pickSaveRoute", () => {
  it("iPhone opens the vCard", () => {
    expect(pickSaveRoute(env(IPHONE, { maxTouchPoints: 5 }))).toBe("vcard");
  });

  it("an iPad with the desktop user agent opens the vCard", () => {
    expect(pickSaveRoute(env(IPAD_DESKTOP_UA, { maxTouchPoints: 5 }))).toBe("vcard");
  });

  it("a Mac (no touch) copies", () => {
    expect(pickSaveRoute(env(IPAD_DESKTOP_UA))).toBe("copy");
  });

  it("Android shares the contact file when it can", () => {
    expect(pickSaveRoute(env(ANDROID, { maxTouchPoints: 5 }))).toBe("share");
  });

  it("Android without file sharing copies", () => {
    expect(pickSaveRoute(env(ANDROID, { canShareFile: false }))).toBe("copy");
  });

  it("desktop copies, even where it could share", () => {
    expect(pickSaveRoute(env(WINDOWS))).toBe("copy");
  });

  it("no clipboard and no share: falls back to the vCard download", () => {
    expect(pickSaveRoute(env(WINDOWS, { canShareFile: false, hasClipboard: false }))).toBe("vcard");
  });
});

describe("shareOrCopy", () => {
  const file = new File(["BEGIN:VCARD"], "شنايدر.vcf", { type: "text/vcard" });

  it("share resolved → the open hint", async () => {
    const share = vi.fn(() => Promise.resolve());
    await expect(shareOrCopy("share", { share }, file, "0777 970 3832")).resolves.toBe("opened");
    expect(share).toHaveBeenCalledWith(file);
  });

  it("share sheet closed by the buyer → no hint, nothing copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = () => Promise.reject(new DOMException("closed", "AbortError"));
    await expect(shareOrCopy("share", { share, writeText }, file, "0777 970 3832")).resolves.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share refused for another reason → copies instead", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = () => Promise.reject(new DOMException("no target", "NotAllowedError"));
    await expect(shareOrCopy("share", { share, writeText }, file, "0777 970 3832")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("0777 970 3832");
  });

  it("copy confirms only after the clipboard resolves", async () => {
    let resolveWrite: () => void = () => undefined;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolveWrite = r)));
    const outcome = shareOrCopy("copy", { writeText }, file, "0777 970 3832");
    let settled = false;
    void outcome.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveWrite();
    await expect(outcome).resolves.toBe("copied");
  });

  it("clipboard refused → the save-by-hand hint", async () => {
    const writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    await expect(shareOrCopy("copy", { writeText }, file, "0777 970 3832")).resolves.toBe("manual");
  });

  it("no clipboard at all → the save-by-hand hint", async () => {
    await expect(shareOrCopy("copy", {}, file, "0777 970 3832")).resolves.toBe("manual");
  });
});
