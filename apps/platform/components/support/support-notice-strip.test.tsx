// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "ar" }),
}));

import { SupportNoticeStrip } from "./support-notice-strip";

afterEach(cleanup);

describe("SupportNoticeStrip", () => {
    it("shows what support told every merchant, under its label", () => {
        render(
            <SupportNoticeStrip
                notice={{ id: "n1", body: "برايم متأخر اليوم", created_at: "2026-11-16T12:00:00Z", ends_at: "2026-11-16T18:00:00Z" }}
            />,
        );
        expect(screen.getByRole("status").textContent).toContain("support.notice.label");
        expect(screen.getByText("برايم متأخر اليوم").getAttribute("dir")).toBe("auto");
    });
});
