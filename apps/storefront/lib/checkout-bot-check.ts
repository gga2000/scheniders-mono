import { checkBotId } from "botid/server";

/**
 * `monitor` only logs a bot verdict (used to measure false positives before
 * enforcing); anything else, including unset, refuses the order.
 */
export function checkoutBotMode(): "enforce" | "monitor" {
  return process.env.STOREFRONT_BOTID_MODE === "monitor" ? "monitor" : "enforce";
}

/**
 * True when this checkout request should be refused as automated. Fake COD
 * orders cost the store a WhatsApp send and a courier trip each, so scripted
 * submissions are stopped before any order work starts. Outside Vercel
 * production BotID answers "human", so local runs and tests are unaffected.
 */
export async function checkoutIsBot(tenantId: string): Promise<boolean> {
  const verdict = await checkBotId();
  if (!verdict.isBot) return false;
  const mode = checkoutBotMode();
  console.warn("[checkout] BotID bot verdict", { tenantId, mode, verifiedBot: verdict.isVerifiedBot });
  return mode === "enforce";
}
