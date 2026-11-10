import { describe, expect, it } from "vitest";
import { generateBackupCsv } from "./backup-csv";

describe("generateBackupCsv", () => {
    it("neutralises text that Excel would run as a formula", () => {
        const csv = generateBackupCsv([
            { name: '=HYPERLINK("http://x","click")' },
            { name: "+9647701234567" },
            { name: "-1+1" },
            { name: "@SUM(A1)" },
            { name: "\tcmd" },
        ]);
        expect(csv.split("\n")).toEqual([
            "name",
            `"'=HYPERLINK(""http://x"",""click"")"`,
            `"'+9647701234567"`,
            `"'-1+1"`,
            `"'@SUM(A1)"`,
            `"'\tcmd"`,
        ]);
    });

    it("keeps numbers, booleans, nulls and JSON as data", () => {
        const csv = generateBackupCsv([{ total: -5000, paid: true, note: null, items: [{ q: 1 }], city: "بغداد" }]);
        expect(csv.split("\n")[1]).toBe(`"-5000","true",,"[{""q"":1}]","بغداد"`);
    });

    it("writes nothing for an empty table", () => {
        expect(generateBackupCsv([])).toBe("");
    });
});
