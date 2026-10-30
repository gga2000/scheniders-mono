import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("./env", () => ({
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", INTERAKT_API_KEY: "test-key" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

import { categorizeWhatsAppFailure } from "./whatsapp-error-handler";
import { interaktErrorMessage } from "./interakt";

// Bodies and messages as Interakt returned them in production (whatsapp_logs, Vercel logs).
const WALLET_BODY = ["Your wallet doesn't have sufficient balance. Please recharge your wallet to continue sending messages."];
const BAD_NUMBER = "Please correct the following error - Phone Number & Country Code provided is invalid";
const BAD_TEMPLATE = "Please correct the following error - No approved template found with name 'order_reminder' and language 'en'. Please re-sync on Interakt dashboard and try again";

const reasonFor = (error: string, statusCode: number) =>
    categorizeWhatsAppFailure({ success: false, error, statusCode }, "7624", "07830612746").attention_reasons[0];

describe("interaktErrorMessage", () => {
    it("reads the bare string array Interakt sends for an empty wallet", () => {
        expect(interaktErrorMessage(WALLET_BODY)).toBe(WALLET_BODY[0]);
    });

    it("reads .message, as a string or an array", () => {
        expect(interaktErrorMessage({ result: false, message: BAD_NUMBER })).toBe(BAD_NUMBER);
        expect(interaktErrorMessage({ result: false, message: WALLET_BODY })).toBe(WALLET_BODY[0]);
    });

    it("returns undefined when the body carries no reason", () => {
        expect(interaktErrorMessage({ result: false })).toBeUndefined();
        expect(interaktErrorMessage([])).toBeUndefined();
        expect(interaktErrorMessage(null)).toBeUndefined();
    });
});

describe("categorizeWhatsAppFailure", () => {
    it("flags an empty Interakt wallet, not the customer's number", () => {
        expect(reasonFor(interaktErrorMessage(WALLET_BODY) ?? "", 400)).toBe("whatsapp_wallet_empty");
    });

    it("still flags a number Interakt rejects", () => {
        expect(reasonFor(BAD_NUMBER, 400)).toBe("whatsapp_invalid_number");
    });

    it("does not blame the number for a template problem or a bare 400", () => {
        expect(reasonFor(BAD_TEMPLATE, 400)).toBe("whatsapp_config_error");
        expect(reasonFor("HTTP 400", 400)).toBe("whatsapp_send_failed");
    });

    it("keeps rate limit and network categories", () => {
        expect(reasonFor("HTTP 429", 429)).toBe("whatsapp_rate_limited");
        expect(reasonFor("Interakt API returned invalid response (HTTP 504)", 504)).toBe("whatsapp_network_error");
    });
});
