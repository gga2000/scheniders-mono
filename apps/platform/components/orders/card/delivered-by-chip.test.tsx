// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DeliveredByChip } from "./delivered-by-chip";

const link = { connected: true, branchName: null, checked: true };
vi.mock("@/hooks/use-prime-link", () => ({ usePrimeConnection: () => link }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

afterEach(() => {
    cleanup();
    link.connected = true;
});

const kind = (container: HTMLElement) => container.querySelector("[data-delivered-by]")?.getAttribute("data-delivered-by") ?? null;

describe("DeliveredByChip", () => {
    it("says Prime moved it when the Prime link marked it delivered", () => {
        const { container } = render(<DeliveredByChip order={{ status: "delivered", last_status_changed_by_name: "Prime" }} />);
        expect(kind(container)).toBe("prime");
    });

    it("says by hand when one of the team marked it delivered", () => {
        const { container } = render(<DeliveredByChip order={{ status: "delivered", last_status_changed_by_name: "Mohammed" }} />);
        expect(kind(container)).toBe("manual");
    });

    it("stays off other statuses and tenants without the link", () => {
        expect(kind(render(<DeliveredByChip order={{ status: "in_transit", last_status_changed_by_name: "Prime" }} />).container)).toBeNull();
        cleanup();
        link.connected = false;
        expect(kind(render(<DeliveredByChip order={{ status: "delivered", last_status_changed_by_name: "Prime" }} />).container)).toBeNull();
    });
});
