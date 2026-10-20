import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * PERF-D1. <OrdersProvider> used to wrap the root layout, so the order-book
 * window fetch (plus its aggregates RPC and realtime channel) ran on EVERY
 * platform route. It is now mounted by the routes that show orders, and only
 * there.
 *
 * Which routes fetch the book is decided by the file tree, so it is checked
 * against the file tree: a route fetches the book exactly when its page or one
 * of its layouts renders <OrdersProvider>, and nothing else can start the
 * window fetch (it lives only in useOrdersQuery, called only by useOrders,
 * called only by OrdersProvider; no other code pages the order table by date).
 */

const PLATFORM = path.resolve(__dirname, "../..");
const APP = path.join(PLATFORM, "app");

/** The routes that mount the order book. Adding one is a decision, not an accident. */
const BOOK_ROUTES = ["/analytics", "/finances", "/orders", "/printing", "/products", "/reports"];

/**
 * Under a book-mounting layout, but the layout skips the book for them on
 * desktop (orders-provider.test.tsx renders it to prove so). On mobile the
 * orders layout replaces every /orders/* page with the mobile orders list,
 * which does read the book.
 */
const LAYOUT_GATED = ["/orders/trash"];

/** Source without comments, so prose that names a component does not count as using it. */
const code = (file: string) =>
    readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const rendersBook = (file: string) => existsSync(file) && /<OrdersProvider[\s>]/.test(code(file));

/** Every page under app/, with the files that decide whether it mounts the book. */
function collectRoutes(dir: string, segments: string[], layouts: string[]): { route: string; files: string[] }[] {
    const layout = ["layout.tsx", "layout.ts"].map((f) => path.join(dir, f)).filter(existsSync);
    const chain = [...layouts, ...layout];
    const out: { route: string; files: string[] }[] = [];
    const page = ["page.tsx", "page.ts"].map((f) => path.join(dir, f)).find(existsSync);
    if (page) {
        // Route groups — (auth) — do not appear in the URL.
        const route = "/" + segments.filter((s) => !/^\(.*\)$/.test(s)).join("/");
        out.push({ route, files: [...chain, page] });
    }
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (entry === "api" || !statSync(full).isDirectory()) continue;
        out.push(...collectRoutes(full, [...segments, entry], chain));
    }
    return out;
}

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const relative = (file: string) => path.relative(PLATFORM, file);

describe("order book mounting (PERF-D1)", () => {
    const routes = collectRoutes(APP, [], []);

    it("the root layout does not mount the order book", () => {
        expect(rendersBook(path.join(APP, "layout.tsx"))).toBe(false);
    });

    it("only the opted-in routes fetch the order book", () => {
        const underBook = routes.filter((r) => r.files.some(rendersBook)).map((r) => r.route);
        const fetching = underBook.filter((r) => !LAYOUT_GATED.includes(r)).sort();
        expect(fetching).toEqual(BOOK_ROUTES);
        expect(underBook.filter((r) => LAYOUT_GATED.includes(r)).sort()).toEqual(LAYOUT_GATED);
        // Before this change the root layout mounted the book, so every route
        // fetched it. Kept visible so the cost the change removes is on record.
        // The walk must have found the rest of the app, or "only these" proves nothing.
        expect(routes.length).toBeGreaterThan(BOOK_ROUTES.length + LAYOUT_GATED.length + 10);
        console.info(`[PERF-D1] routes fetching the order book: ${fetching.length} of ${routes.length} (was ${routes.length} of ${routes.length})`);
    });

    it("the product editor routes do not fetch it — only the products list does", () => {
        const editor = routes.filter((r) => r.route.startsWith("/products/"));
        expect(editor.length).toBeGreaterThan(0);
        for (const r of editor) expect(r.files.some(rendersBook), r.route).toBe(false);
    });

    it("nothing but OrdersProvider can start the window fetch", () => {
        const files = sourceFiles(PLATFORM);
        const callers = (pattern: RegExp, definedIn: string) =>
            files
                .filter((f) => relative(f) !== definedIn && pattern.test(code(f)))
                .map(relative)
                .sort();

        expect(callers(/\buseOrdersQuery\(/, "hooks/use-orders-query.ts")).toEqual(["hooks/use-orders.ts"]);
        expect(callers(/\buseOrders\(\)/, "hooks/use-orders.ts")).toEqual(["components/providers/orders-provider.tsx"]);
    });

    it("nothing outside the book pages the order table in by date", () => {
        // findWindow (and findAll, which it falls back to for a null window)
        // is the order book. A sidebar hover prefetch used to call it with no
        // window from every route, downloading every order.
        const files = sourceFiles(PLATFORM).filter((f) => relative(f) !== "lib/repositories/order-repository.ts");
        const callers = (pattern: RegExp) => files.filter((f) => pattern.test(code(f))).map(relative).sort();

        expect(callers(/\borderRepository\.(findWindow|findAll)\(/)).toEqual([
            "hooks/use-duplicate-window-alerts.ts",
            "hooks/use-orders-query.ts",
        ]);
        // Both run only under OrdersProvider: the duplicate margin from useOrders,
        // the window from useOrdersQuery — its one fetchOrders call.
        expect(callers(/\buseDuplicateWindowAlerts\(/).filter((f) => f !== "hooks/use-duplicate-window-alerts.ts")).toEqual([
            "hooks/use-orders.ts",
        ]);
        const query = code(path.join(PLATFORM, "hooks/use-orders-query.ts"));
        expect(query.match(/\bfetchOrders\(/g)?.length, "fetchOrders definition + one call").toBe(2);
        expect(query).not.toMatch(/\bprefetchQuery\(/);
    });
});
