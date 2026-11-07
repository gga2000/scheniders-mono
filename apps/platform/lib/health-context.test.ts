import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { runHealthChecks } from "@scheniders/shared/health-rules";
import { healthContextFor } from "./health-context";

const statusOf = (report: ReturnType<typeof runHealthChecks>, id: string) =>
    report.checks.find((c) => c.id === id)?.status;

describe("healthContextFor", () => {
    it("a WhatsApp number kept in Settings counts, as the storefront shows it", () => {
        const cfg = emptyStoreConfigV2();
        const ctx = healthContextFor(
            { store_config: { contact: { whatsapp_number: "07779703832" } }, contact_phone: null },
            cfg,
        );
        expect(ctx.whatsapp).toBe("07779703832");
        expect(statusOf(runHealthChecks(cfg, ctx), "whatsapp_number_set")).toBe("pass");
    });

    it("the store call number counts for the footer phone check", () => {
        const cfg = emptyStoreConfigV2();
        const ctx = healthContextFor({ store_config: null, contact_phone: "07801234567" }, cfg);
        expect(statusOf(runHealthChecks(cfg, ctx), "contact_phone_set")).toBe("pass");
    });

    it("still warns when the store shows no number at all", () => {
        const cfg = emptyStoreConfigV2();
        const ctx = healthContextFor({ store_config: null, contact_phone: null }, cfg);
        const report = runHealthChecks(cfg, ctx);
        expect(statusOf(report, "whatsapp_number_set")).toBe("warn");
        expect(statusOf(report, "contact_phone_set")).toBe("warn");
    });
});
