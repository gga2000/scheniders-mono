// @vitest-environment jsdom
// The toolbar offers a tag filter only when the store has tags, and every sort
// field can go both ways with the current direction shown.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
vi.mock("framer-motion", () => ({
    motion: new Proxy({}, { get: () => ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }),
}));

import { CustomerToolbar } from "./customer-toolbar";

afterEach(cleanup);

const base = {
    search: "", onSearch: () => {}, sortBy: "total_spent", sortOrder: "asc" as const, onSort: () => {},
    view: "grid" as const, onView: () => {}, tagId: "", onTag: () => {}, stickyTop: 0,
};

describe("CustomerToolbar", () => {
    it("sticks under the shell header's offset and follows its slide", () => {
        const { container } = render(<CustomerToolbar {...base} tags={[]} stickyTop={72} />);
        const band = container.firstElementChild as HTMLElement;
        expect(band.style.top).toBe("72px");
        expect(band.className).toContain("sm:sticky");
        expect(band.className).toContain("transition-[top]");
    });

    it("hides the tag filter when the store has no tags", () => {
        render(<CustomerToolbar {...base} tags={[]} />);
        expect(screen.queryByLabelText("Filter by tag")).toBeNull();
    });

    it("reports the chosen tag", () => {
        const onTag = vi.fn();
        render(<CustomerToolbar {...base} tags={[{ id: "t1", name: "VIP" }]} onTag={onTag} />);
        fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "t1" } });
        expect(onTag).toHaveBeenCalledWith("t1");
    });

    it("shows the sort direction and offers both directions per field", () => {
        const onSort = vi.fn();
        render(<CustomerToolbar {...base} tags={[]} onSort={onSort} />);
        expect(screen.getAllByText(/↑/).length).toBeGreaterThan(0);
        fireEvent.change(screen.getByLabelText("customers.sort.label"), { target: { value: "last_order_date:asc" } });
        expect(onSort).toHaveBeenCalledWith("last_order_date", "asc");
    });
});
