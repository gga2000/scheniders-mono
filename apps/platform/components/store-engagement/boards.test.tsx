import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ReviewsBoard } from "./reviews-board";
import { RecoveryBoard } from "./recovery-board";
import type { AdminReview } from "@/hooks/use-product-reviews";

const review = (over: Partial<AdminReview>): AdminReview => ({
    id: "r1", product_id: "p1", rating: 4, title: "Nice", body: "Good", author_name: "Sara",
    photo_urls: [], status: "pending", created_at: "2026-10-30T10:00:00Z", product_name: "Watch", ...over,
});

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe("ReviewsBoard", () => {
    it("shows an error instead of an empty list when the read fails", () => {
        wrap(<ReviewsBoard reviews={[]} isLoading={false} isError busyId={null} onSetStatus={vi.fn()} onRemove={vi.fn()} />);
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("approves a pending review", () => {
        const onSetStatus = vi.fn();
        wrap(<ReviewsBoard reviews={[review({})]} isLoading={false} isError={false} busyId={null} onSetStatus={onSetStatus} onRemove={vi.fn()} />);
        const approve = screen.getAllByRole("button").find((b) => /^(approve|قبول)$/i.test((b.textContent ?? "").trim()));
        fireEvent.click(approve!);
        expect(onSetStatus).toHaveBeenCalledWith("r1", "approved");
    });

    it("does not delete until the merchant confirms", () => {
        const onRemove = vi.fn();
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        wrap(<ReviewsBoard reviews={[review({})]} isLoading={false} isError={false} busyId={null} onSetStatus={vi.fn()} onRemove={onRemove} />);
        const del = screen.getAllByRole("button").find((b) => /delete|حذف/i.test(b.textContent ?? ""));
        fireEvent.click(del!);
        expect(onRemove).not.toHaveBeenCalled();
        confirm.mockReturnValue(true);
        fireEvent.click(del!);
        expect(onRemove).toHaveBeenCalledWith("r1");
        confirm.mockRestore();
    });
});

describe("RecoveryBoard", () => {
    it("shows an error instead of zero stats when the read fails", () => {
        wrap(<RecoveryBoard carts={[]} isLoading={false} isError />);
        expect(screen.getByRole("alert")).toBeTruthy();
    });
});
