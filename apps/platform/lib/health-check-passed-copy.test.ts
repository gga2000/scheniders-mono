import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { runHealthChecks } from "@scheniders/shared/health-rules";
import { CHECK_COPY, CHECK_PASSED_COPY } from "@/lib/health-check-copy";

describe("health check copy", () => {
    it("every check with failure copy also says what it confirms when it passes", () => {
        const missing = Object.keys(CHECK_COPY).filter((id) => !CHECK_PASSED_COPY[id]?.ar);
        expect(missing).toEqual([]);
    });

    it("every check the engine runs has both copies", () => {
        const ids = runHealthChecks(emptyStoreConfigV2()).checks.map((c) => c.id);
        const missing = ids.filter((id) => !CHECK_COPY[id] || !CHECK_PASSED_COPY[id]);
        expect(missing).toEqual([]);
    });
});
