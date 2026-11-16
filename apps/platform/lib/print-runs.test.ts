import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { runKind, runTitle } from "./print-runs";

const ar: Record<string, string> = {
    "printing.runKindPrime": "ملف برايم",
    "printing.runKindWaseet": "ملف الوسيط",
};
const t = (key: string) => ar[key] ?? key;

describe("print run titles", () => {
    it("shows a Prime hand-off in the merchant's language, keeping its date", () => {
        expect(runTitle({ name: "Prime Export 16/11/2026" }, t)).toBe("ملف برايم 16/11/2026");
    });

    it("shows an Al-Waseet hand-off in the merchant's language", () => {
        expect(runTitle({ name: "Al-Waseet Export 16/11/2026" }, t)).toBe("ملف الوسيط 16/11/2026");
    });

    it("leaves a label run's date and time as stored", () => {
        expect(runTitle({ name: "16/11/2026 04:30" }, t)).toBe("16/11/2026 04:30");
    });

    it("keeps reading the kind from the stored English name", () => {
        expect(runKind({ name: "Prime Export 16/11/2026" })).toBe("prime");
        expect(runKind({ name: "Al-Waseet Export 16/11/2026" })).toBe("waseet");
        expect(runKind({ name: "16/11/2026 04:30" })).toBe("labels");
    });
});
