import { describe, expect, it } from "vitest";
import { composeTabTitle, setTabTitlePart } from "./tab-title";
import { pageTabTitle } from "@/hooks/use-page-tab-title";

describe("tab title", () => {
    it("names the page, then the brand", () => {
        expect(composeTabTitle({ page: "الطلبات", notifications: 0, chat: 0 })).toBe("الطلبات · شنايدر");
        expect(composeTabTitle({ page: "", notifications: 0, chat: 0 })).toBe("شنايدر");
    });

    it("adds bell and chat counts into one badge, capped at 99+", () => {
        expect(composeTabTitle({ page: "التقارير", notifications: 3, chat: 2 })).toBe("(5) التقارير · شنايدر");
        expect(composeTabTitle({ page: "التقارير", notifications: 120, chat: 0 })).toBe("(99+) التقارير · شنايدر");
    });

    it("keeps the page name when a count changes, and the count when the page changes", () => {
        setTabTitlePart("page", "الطلبات");
        setTabTitlePart("notifications", 4);
        expect(document.title).toBe("(4) الطلبات · شنايدر");
        setTabTitlePart("page", "المالية");
        expect(document.title).toBe("(4) المالية · شنايدر");
        setTabTitlePart("notifications", 0);
        setTabTitlePart("chat", 0);
        expect(document.title).toBe("المالية · شنايدر");
    });

    it("names a page by its sidebar label, and leaves pages without one unnamed", () => {
        const labels: Record<string, string> = { "nav.orders": "الطلبات", "nav.finances": "المالية" };
        const t = (key: string) => labels[key] ?? key;
        expect(pageTabTitle("/orders", t)).toBe("الطلبات");
        expect(pageTabTitle("/finances/new", t)).toBe("المالية");
        expect(pageTabTitle("/login", t)).toBe("");
        expect(pageTabTitle("/", t)).toBe("");
        expect(pageTabTitle(null, t)).toBe("");
    });
});
