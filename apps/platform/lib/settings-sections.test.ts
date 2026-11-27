import { describe, expect, it } from "vitest";
import {
    SETTINGS_SEARCH,
    SETTINGS_SECTIONS,
    normalizeSettingsSearch,
    resolveSettingsSection,
    searchSettings,
    settingsHref,
} from "./settings-sections";

describe("resolveSettingsSection", () => {
    it("opens a current section as is", () => {
        expect(resolveSettingsSection("delivery-fees")).toEqual({ section: "delivery-fees", focus: null });
    });

    it("lands every old tile id on its new home", () => {
        expect(resolveSettingsSection("general")).toEqual({ section: "account", focus: null });
        expect(resolveSettingsSection("orders")).toEqual({ section: "order-reasons", focus: null });
        expect(resolveSettingsSection("printing")).toEqual({ section: "label", focus: null });
        expect(resolveSettingsSection("integrations")).toEqual({ section: "waseet", focus: null });
        expect(resolveSettingsSection("pages")).toEqual({ section: "team", focus: "page-access" });
        expect(resolveSettingsSection("support-activity")).toEqual({ section: "team", focus: "support-activity" });
        expect(resolveSettingsSection("data")).toEqual({ section: "vault", focus: null });
    });

    it("opens the overview for nothing or an unknown id", () => {
        expect(resolveSettingsSection(null)).toEqual({ section: "overview", focus: null });
        expect(resolveSettingsSection("nope")).toEqual({ section: "overview", focus: null });
    });
});

describe("settingsHref", () => {
    it("builds the link with focus and extra params", () => {
        expect(settingsHref("billing", "wallet", { pay: "1" })).toBe("/settings?section=billing&focus=wallet&pay=1");
        expect(settingsHref("label")).toBe("/settings?section=label");
    });
});

describe("settings search", () => {
    const translate = (key: string) => ({ "settings.orders.fees": "أجور التوصيل", "settings.print.noOpenWarning": "سطر «يمنع فتح الطرد» على الملصق" })[key] ?? key;

    it("reads hamza, teh marbuta and vowel marks as the plain letter", () => {
        expect(normalizeSettingsSearch("  أُجور  التوصيلة ")).toBe("اجور التوصيله");
    });

    it("finds the exact switch by a word in its label or its keywords", () => {
        expect(searchSettings("عطر", translate)[0]?.focus).toBe("label-no-open");
        expect(searchSettings("أجور", translate)[0]?.focus).toBe("delivery-fees");
        expect(searchSettings("waseet", translate)[0]?.focus).toBe("waseet");
        expect(searchSettings("   ", translate)).toEqual([]);
    });

    it("points every entry at a real section, with one entry per block", () => {
        const ids = new Set(SETTINGS_SECTIONS.map((s) => s.id));
        for (const e of SETTINGS_SEARCH) expect(ids.has(e.section), e.focus).toBe(true);
        expect(new Set(SETTINGS_SEARCH.map((e) => e.focus)).size).toBe(SETTINGS_SEARCH.length);
    });
});
