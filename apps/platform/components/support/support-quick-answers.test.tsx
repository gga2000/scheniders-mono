// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QUICK_ANSWERS } from "@/lib/support/quick-answers";

vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "ar" }),
}));

import { SupportQuickAnswers } from "./support-quick-answers";

afterEach(cleanup);

describe("SupportQuickAnswers", () => {
    const [first, second] = QUICK_ANSWERS;

    it("shows questions folded, opens one answer at a time with a link to its page", () => {
        render(<SupportQuickAnswers title="t" answers={[first, second]} onOpenPage={() => undefined} />);
        expect(screen.queryByText(first.answer.ar)).toBeNull();

        fireEvent.click(screen.getByText(first.question.ar));
        expect(screen.getByText(first.answer.ar)).toBeTruthy();
        expect(screen.getByRole("link").getAttribute("href")).toBe(first.href);

        fireEvent.click(screen.getByText(second.question.ar));
        expect(screen.queryByText(first.answer.ar)).toBeNull();
        expect(screen.getByText(second.answer.ar)).toBeTruthy();
    });

    it("closes the chat when the merchant opens the page", () => {
        const onOpenPage = vi.fn();
        render(<SupportQuickAnswers title="t" answers={[first]} onOpenPage={onOpenPage} />);
        fireEvent.click(screen.getByText(first.question.ar));
        fireEvent.click(screen.getByRole("link"));
        expect(onOpenPage).toHaveBeenCalledOnce();
    });

    it("renders nothing with no answers", () => {
        const { container } = render(<SupportQuickAnswers title="t" answers={[]} onOpenPage={() => undefined} />);
        expect(container.innerHTML).toBe("");
    });
});
