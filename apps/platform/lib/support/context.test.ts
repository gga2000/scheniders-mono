import { describe, expect, it } from "vitest";
import { buildSupportContext } from "./context";
import { supportContextSchema } from "./schema";

describe("buildSupportContext", () => {
    it("keeps the page path and drops the query string, which can hold a customer phone", () => {
        const context = buildSupportContext({ pathname: "/customers?search=07701234567#top", language: "ar" });
        expect(context).toEqual({ language: "ar", path: "/customers" });
    });

    it("attaches the open order, the error the merchant saw and the browser facts", () => {
        const context = buildSupportContext({
            pathname: "/orders",
            language: "en",
            orderNumber: "1261103001",
            errorCode: "products.errorBody",
            errorMessage: "Something broke",
            sentryEventId: "0123456789abcdef0123456789abcdef",
            screen: { width: 1440.4, height: 900 },
            userAgent: "Mozilla/5.0",
        });
        expect(context).toEqual({
            language: "en",
            path: "/orders",
            orderNumber: "1261103001",
            errorCode: "products.errorBody",
            errorMessage: "Something broke",
            sentryEventId: "0123456789abcdef0123456789abcdef",
            screen: "1440x900",
            userAgent: "Mozilla/5.0",
        });
    });

    it("leaves out what is empty or malformed instead of sending it", () => {
        const context = buildSupportContext({
            pathname: "/",
            language: "ar",
            orderNumber: null,
            errorCode: "",
            sentryEventId: "not-an-event-id",
            screen: { width: 0, height: 0 },
            userAgent: null,
        });
        expect(context).toEqual({ language: "ar", path: "/" });
    });

    it("always produces something the API accepts, however long the inputs", () => {
        const context = buildSupportContext({
            pathname: `/${"p".repeat(900)}`,
            language: "ar",
            orderNumber: "9".repeat(200),
            errorCode: "c".repeat(500),
            errorMessage: "م".repeat(2000),
            userAgent: "u".repeat(2000),
            screen: { width: 99999, height: 99999 },
        });
        expect(supportContextSchema.safeParse(context).success).toBe(true);
    });
});
