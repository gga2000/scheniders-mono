import { afterEach, describe, expect, it, vi } from "vitest";

const verdict = { isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false };
vi.mock("botid/server", () => ({ checkBotId: vi.fn(async () => verdict) }));

import { checkoutIsBot } from "./checkout-bot-check";

afterEach(() => {
  verdict.isBot = false;
  vi.unstubAllEnvs();
});

describe("checkoutIsBot", () => {
  it("lets a human through", async () => {
    expect(await checkoutIsBot("t1")).toBe(false);
  });

  it("refuses a bot by default", async () => {
    verdict.isBot = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await checkoutIsBot("t1")).toBe(true);
  });

  it("only logs a bot in monitor mode", async () => {
    verdict.isBot = true;
    vi.stubEnv("STOREFRONT_BOTID_MODE", "monitor");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await checkoutIsBot("t1")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
