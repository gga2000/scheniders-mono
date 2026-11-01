// @vitest-environment jsdom
// Blocked customers and numbers that cannot be a WhatsApp mobile are left out
// of the send queue and the recipient count says so.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (key: string, arg?: string | { count?: number }) =>
            typeof arg === "object" ? `${key}:${arg.count}` : arg ?? key,
    }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: new Proxy({}, { get: () => ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }),
}));

import { BroadcastModal } from "./broadcast-modal";

afterEach(cleanup);

describe("BroadcastModal recipients", () => {
    it("counts only sendable customers and reports who was left out", () => {
        render(
            <BroadcastModal
                isOpen
                onClose={() => {}}
                canCopyNumbers={false}
                recipients={[
                    { phone: "7701234567", name: "A", is_blacklisted: false },
                    { phone: "7701234568", name: "B", is_blacklisted: true },
                    { phone: "12345", name: "C", is_blacklisted: false },
                ]}
            />,
        );
        const text = document.body.textContent ?? "";
        expect(text).toContain("customers.broadcast.recipients:1");
        expect(text).toContain("customers.broadcast.blockedSkipped:1");
        expect(text).toContain("customers.broadcast.invalidSkipped:1");
        expect(screen.queryByText(/customers.broadcast.recipients:3/)).toBeNull();
    });

    it("offers Cancel beside Next while composing, and Cancel closes the dialog", () => {
        const onClose = vi.fn();
        render(<BroadcastModal isOpen onClose={onClose} canCopyNumbers={false} recipients={[{ phone: "7701234567", name: "A", is_blacklisted: false }]} />);
        fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
