/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import type { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const auth = vi.hoisted(() => ({
    current: {
        user: { id: "u1" },
        profile: null,
        role: null as string | null,
        permissions: [] as string[],
        profileLoaded: false,
        isLoading: false,
        signOut: async () => {},
    },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/orders",
    useRouter: () => ({ push: () => {} }),
    useSearchParams: () => null,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth.current }));
vi.mock("@/hooks/use-customers-query", () => ({ usePrefetchCustomers: () => () => {} }));
vi.mock("@/hooks/use-products-query", () => ({ usePrefetchProducts: () => () => {} }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("@/components/ui/notification-center", () => ({ NotificationCenter: () => null }));
vi.mock("./transition-link", () => ({
    TransitionLink: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { Sidebar } from "./sidebar";

afterEach(() => {
    cleanup();
});

function navLinks(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("nav a")).map((a) => a.getAttribute("href") ?? "");
}

describe("Sidebar while the role is loading", () => {
    it("shows placeholders, not the short ungated list, before the role is known", () => {
        auth.current = { ...auth.current, role: null, permissions: [], profileLoaded: false };
        const { container } = render(<Sidebar collapsed={true} setCollapsed={() => {}} />);
        expect(navLinks(container)).toEqual([]);
        expect(container.querySelectorAll("nav .animate-pulse").length).toBeGreaterThan(0);
    });

    it("shows the role's full list once the role is known", () => {
        auth.current = { ...auth.current, role: "super_admin", profileLoaded: true };
        const { container } = render(<Sidebar collapsed={true} setCollapsed={() => {}} />);
        const links = navLinks(container);
        expect(links).toContain("/orders");
        expect(links.length).toBeGreaterThan(2);
        expect(container.querySelectorAll("nav .animate-pulse").length).toBe(0);
    });
});
