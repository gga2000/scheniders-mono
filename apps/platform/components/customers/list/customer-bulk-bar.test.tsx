// @vitest-environment jsdom
// "Select all N" must appear only while the filter matches more customers than
// are selected, and must call back once.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (key: string, arg?: string | { count?: string }) =>
            typeof arg === "object" ? `${key}:${arg.count}` : arg ?? key,
    }),
}));
vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}));

import { CustomerBulkBar } from "./customer-bulk-bar";

const noop = () => {};

afterEach(cleanup);

describe("CustomerBulkBar select all", () => {
    it("offers every matching customer and reports the click", () => {
        const onSelectAll = vi.fn();
        render(
            <CustomerBulkBar selectedCount={3} totalMatching={1200} onSelectAll={onSelectAll} allSelected={false} selectingAll={false}
                onAddTag={noop} onBroadcast={noop} onClear={noop} />,
        );
        fireEvent.click(screen.getByText("customers.bulk.selectAllMatching:1,200"));
        expect(onSelectAll).toHaveBeenCalledTimes(1);
    });

    it("hides the offer once everything is selected", () => {
        render(
            <CustomerBulkBar selectedCount={50} totalMatching={50} onSelectAll={noop} allSelected selectingAll={false}
                onAddTag={noop} onBroadcast={noop} onClear={noop} />,
        );
        expect(screen.queryByText(/selectAllMatching/)).toBeNull();
    });

    it("hides the offer from users who may not bulk-read customers", () => {
        render(
            <CustomerBulkBar selectedCount={3} totalMatching={1200} allSelected={false} selectingAll={false}
                onAddTag={noop} onBroadcast={noop} onClear={noop} />,
        );
        expect(screen.queryByText(/selectAllMatching/)).toBeNull();
    });
});

describe("CustomerBulkBar tagging", () => {
    it("hides Add tag from users without customers.edit", () => {
        render(
            <CustomerBulkBar selectedCount={3} totalMatching={3} allSelected selectingAll={false}
                onBroadcast={noop} onClear={noop} />,
        );
        expect(screen.queryByText("customers.bulk.addTag")).toBeNull();
    });

    it("shows Add tag when the page supplies the handler", () => {
        render(
            <CustomerBulkBar selectedCount={3} totalMatching={3} allSelected selectingAll={false}
                onAddTag={noop} onBroadcast={noop} onClear={noop} />,
        );
        expect(screen.getByText("customers.bulk.addTag")).toBeTruthy();
    });
});
