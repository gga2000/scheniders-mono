import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { setSidebarCollapsed, useHydrated, useSidebarCollapsed } from "./use-sidebar-collapsed";

/**
 * A merchant who keeps the sidebar open had it hydrate with rows still styled
 * as collapsed: the preference was read from localStorage during the first
 * render, so the server HTML (collapsed) and the browser's first render (open)
 * disagreed, and React does not patch attributes after a mismatch.
 */

function Sidebar({ collapsed }: { collapsed: boolean }) {
    return <aside data-collapsed={String(collapsed)} title={collapsed ? "tip" : undefined} style={{ width: collapsed ? 72 : 256 }} />;
}

function Layout() {
    const collapsed = useSidebarCollapsed();
    const hydrated = useHydrated();
    return <Sidebar key={hydrated ? "client" : "server"} collapsed={collapsed} />;
}

/** The pattern this replaced: the saved value read in a useState initializer. */
function OldLayout() {
    const [collapsed] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("sidebarCollapsed") !== "false" : true));
    return <Sidebar collapsed={collapsed} />;
}

let container: HTMLDivElement;
let root: Root | null = null;
const recoverable: unknown[] = [];

/** Server-render with no window, as Next does, then hydrate in the browser. */
async function serverThenHydrate(ui: React.ReactElement) {
    const saved = localStorage.getItem("sidebarCollapsed");
    localStorage.removeItem("sidebarCollapsed");
    // The server has no localStorage: render it with the server snapshot.
    const html = renderToString(ui);
    if (saved !== null) localStorage.setItem("sidebarCollapsed", saved);
    container.innerHTML = html;
    await act(async () => {
        root = hydrateRoot(container, ui, { onRecoverableError: (e) => recoverable.push(e) });
    });
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    recoverable.length = 0;
    localStorage.clear();
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
});

describe("sidebar collapsed preference", () => {
    it("hydrates without a mismatch and then shows the saved open state", async () => {
        localStorage.setItem("sidebarCollapsed", "false");
        const errors: string[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
        try {
            await serverThenHydrate(<Layout />);
        } finally {
            console.error = original;
        }
        expect(recoverable).toEqual([]);
        expect(errors.filter((e) => /hydrat|didn't match/i.test(e))).toEqual([]);
        const aside = container.querySelector("aside");
        expect(aside?.getAttribute("data-collapsed")).toBe("false");
        expect(aside?.getAttribute("title")).toBeNull();
        expect(aside?.style.width).toBe("256px");
    });

    it("the old pattern does mismatch — the failure this guards against", async () => {
        localStorage.setItem("sidebarCollapsed", "false");
        const errors: string[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
        try {
            await serverThenHydrate(<OldLayout />);
        } finally {
            console.error = original;
        }
        expect(errors.some((e) => /hydrat|didn't match/i.test(e)) || recoverable.length > 0).toBe(true);
    });

    it("defaults to collapsed, and a toggle is saved and rendered", async () => {
        await serverThenHydrate(<Layout />);
        expect(container.querySelector("aside")?.getAttribute("data-collapsed")).toBe("true");
        await act(async () => setSidebarCollapsed(false));
        expect(container.querySelector("aside")?.getAttribute("data-collapsed")).toBe("false");
        expect(localStorage.getItem("sidebarCollapsed")).toBe("false");
    });

    it("follows a change made in another tab", async () => {
        await serverThenHydrate(<Layout />);
        await act(async () => {
            localStorage.setItem("sidebarCollapsed", "false");
            window.dispatchEvent(new StorageEvent("storage", { key: "sidebarCollapsed" }));
        });
        expect(container.querySelector("aside")?.getAttribute("data-collapsed")).toBe("false");
    });
});
