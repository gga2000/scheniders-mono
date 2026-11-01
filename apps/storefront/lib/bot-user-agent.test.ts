import { describe, it, expect } from "vitest";
import { isLikelyBot } from "./bot-user-agent";

describe("isLikelyBot", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36",
    "curl/8.4.0",
    null,
    "",
  ])("flags %s", (ua) => expect(isLikelyBot(ua)).toBe(true));

  it.each([
    "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; CUBOT_X30) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Telegram-Android/10.2",
    "Mozilla/5.0 (Linux; Android 11; Redmi Note 9) AppleWebKit/537.36 Chrome/119.0 Mobile Safari/537.36 monitor-app preview",
  ])("lets real browsers through", (ua) => expect(isLikelyBot(ua)).toBe(false));
});
