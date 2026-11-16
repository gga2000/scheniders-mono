import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { runKind, runTitle } from "./print-runs";

const ar: Record<string, string> = {
    "printing.runKindPrime": "ملف برايم",
    "printing.runKindWaseet": "ملف الوسيط",
};
const t = (key: string) => ar[key] ?? key;
const NOW = new Date("2026-11-16T12:00:00+03:00");

describe("print run titles", () => {
    it("shows a Prime hand-off in the merchant's language, keeping its date", () => {
        expect(runTitle({ name: "Prime Export 16/11/2026" }, t, "ar", NOW)).toBe("ملف برايم 16 تشرين الثاني");
    });

    it("shows an Al-Waseet hand-off in the merchant's language", () => {
        expect(runTitle({ name: "Al-Waseet Export 16/11/2026" }, t, "ar", NOW)).toBe("ملف الوسيط 16 تشرين الثاني");
    });

    it("writes a label run's date as every other date reads, keeping its time", () => {
        expect(runTitle({ name: "16/11/2026 04:30" }, t, "ar", NOW)).toBe("16 تشرين الثاني 04:30");
        expect(runTitle({ name: "3/1/2025" }, t, "en", NOW)).toBe("Jan 3, 2025");
        expect(runTitle({ name: "Run for Basra" }, t, "ar", NOW)).toBe("Run for Basra");
    });

    it("keeps reading the kind from the stored English name", () => {
        expect(runKind({ name: "Prime Export 16/11/2026" })).toBe("prime");
        expect(runKind({ name: "Al-Waseet Export 16/11/2026" })).toBe("waseet");
        expect(runKind({ name: "16/11/2026 04:30" })).toBe("labels");
    });
});
