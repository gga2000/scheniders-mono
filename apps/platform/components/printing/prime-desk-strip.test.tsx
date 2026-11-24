/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PrimeDeskStrip } from "./prime-desk-strip";

afterEach(cleanup);

const counts = { sent: 2, waiting: 5, fix: 1 };

describe("PrimeDeskStrip", () => {
    it("counts sent, waiting and to-fix parcels", () => {
        const { container } = render(<LanguageProvider><PrimeDeskStrip counts={counts} /></LanguageProvider>);
        expect(container.querySelector('[data-prime-count="waiting"]')?.textContent).toContain("5");
    });

    it("says the Prime check failed, with a retry, instead of counting zeros", () => {
        const retry = vi.fn();
        const { container } = render(
            <LanguageProvider><PrimeDeskStrip counts={{ sent: 0, waiting: 0, fix: 0 }} failed onRetry={retry} /></LanguageProvider>,
        );
        expect(container.querySelector("[data-prime-count]")).toBeNull();
        expect(screen.getByRole("alert").textContent).toContain("ما كدرنا نفحص الطلبات ويا برايم");
        fireEvent.click(screen.getByText("جرّب مرة ثانية"));
        expect(retry).toHaveBeenCalledOnce();
    });
});
