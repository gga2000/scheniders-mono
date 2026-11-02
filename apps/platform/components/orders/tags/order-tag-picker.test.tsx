import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OrderTagPicker } from "./order-tag-picker";

const TAGS = [
    { id: "00000000-0000-4000-8000-000000000001", name: "Call back", color: "orange" as const },
    { id: "00000000-0000-4000-8000-000000000002", name: "VIP", color: "purple" as const },
];

const setTags = vi.fn();
const createTag = vi.fn();
let canEdit = true;

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (k: string, p?: Record<string, string>) => (p?.name ? `${k}:${p.name}` : k), language: "en" }),
}));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => canEdit }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-order-tags", () => ({
    useOrderTags: () => ({ tags: TAGS, isLoading: false }),
    useSetOrderTags: () => ({ mutate: setTags }),
    useOrderTagMutations: () => ({
        create: { mutate: createTag, isPending: false },
        update: { mutate: vi.fn(), isPending: false },
        remove: { mutate: vi.fn(), isPending: false },
    }),
}));

describe("OrderTagPicker", () => {
    afterEach(cleanup);
    beforeEach(() => {
        setTags.mockReset();
        createTag.mockReset();
        canEdit = true;
    });

    it("shows the order's tags and toggles one from the picker", () => {
        const onCardClick = vi.fn();
        render(
            <div onClick={onCardClick}>
                <OrderTagPicker order={{ id: "o1", tag_ids: [TAGS[1].id] }} />
            </div>,
        );
        const trigger = screen.getByRole("button", { name: "orders.tags.edit" });
        expect(trigger.textContent).toContain("VIP");
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole("option", { name: /Call back/ }));
        expect(setTags).toHaveBeenCalledWith(
            { orderId: "o1", tagIds: [TAGS[1].id, TAGS[0].id], previous: [TAGS[1].id] },
            expect.anything(),
        );
        // Clicks in the picker never open the order underneath.
        expect(onCardClick).not.toHaveBeenCalled();
    });

    it("creates a new tag from the search box", () => {
        render(<OrderTagPicker order={{ id: "o1", tag_ids: [] }} />);
        fireEvent.click(screen.getByRole("button", { name: "orders.tags.edit" }));
        const input = screen.getByRole("textbox", { name: "orders.tags.search" });
        fireEvent.change(input, { target: { value: "vip" } });
        expect(screen.queryByText(/orders.tags.create/)).toBeNull();
        fireEvent.change(input, { target: { value: " Fragile " } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(createTag).toHaveBeenCalledWith({ name: "Fragile", color: "blue" }, expect.anything());
    });

    it("is read-only without the edit-orders permission", () => {
        canEdit = false;
        render(<OrderTagPicker order={{ id: "o1", tag_ids: [TAGS[0].id] }} />);
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByText("Call back")).toBeTruthy();
    });
});
