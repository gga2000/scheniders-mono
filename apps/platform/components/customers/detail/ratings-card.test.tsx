// @vitest-environment jsdom
// Only a rating's author gets the remove button; the database refuses anyone else.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { CommunityRating } from "@/types/customer";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
const mutate = vi.fn();
vi.mock("@/hooks/use-community-ratings", () => ({
    RatingNotDeletedError: class RatingNotDeletedError extends Error {},
    useDeleteCommunityRating: () => ({ mutate, isPending: false }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (options: unknown) => toast(options) }));

import { RatingsCard } from "./ratings-card";

const base: CommunityRating = {
    id: "r1", customer_phone: "7701234567", order_id: null, rater_id: "me", rater_store_id: null,
    trust_stars: 5, communication_stars: 4, behavior_stars: 3, overall_type: "positive",
    comment: "pays on time", quick_tags: [], is_anonymous: false, created_at: "2026-10-30T10:00:00Z",
    disputed: false, dispute_reason: null,
};

afterEach(cleanup);

describe("RatingsCard", () => {
    it("shows remove only on the caller's own rating", () => {
        render(<RatingsCard ratings={[base, { ...base, id: "r2", rater_id: "someone-else" }]} />);
        expect(screen.getAllByLabelText("common.delete")).toHaveLength(1);
        expect(screen.getAllByText("pays on time")).toHaveLength(2);
    });

    it("explains an empty list", () => {
        render(<RatingsCard ratings={[]} />);
        expect(screen.getByText("customers.profile.noRatings")).toBeTruthy();
    });

    it("asks for a second tap before removing", () => {
        mutate.mockClear();
        render(<RatingsCard ratings={[base]} />);
        fireEvent.click(screen.getByLabelText("common.delete"));
        expect(mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("customers.profile.ratingRemoveConfirm"));
        expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("tells the person when the removal fails", () => {
        toast.mockClear();
        mutate.mockImplementation((_id: string, options: { onError: (e: Error) => void }) => options.onError(new Error("network")));
        render(<RatingsCard ratings={[base]} />);
        fireEvent.click(screen.getByLabelText("common.delete"));
        fireEvent.click(screen.getByText("customers.profile.ratingRemoveConfirm"));
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error", title: "customers.profile.ratingDeleteError" }));
    });
});
