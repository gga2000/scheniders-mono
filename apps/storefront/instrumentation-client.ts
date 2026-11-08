import { initBotId } from "botid/client/core";
import { CHECKOUT_BOT_PROTECTED_PATHS } from "@/lib/checkout-bot-paths";

// Invisible bot check on order submission (no puzzle for the shopper).
// The server side is lib/checkout-bot-check.ts.
initBotId({
  protect: CHECKOUT_BOT_PROTECTED_PATHS.map((path) => ({ path, method: "POST" as const })),
});
