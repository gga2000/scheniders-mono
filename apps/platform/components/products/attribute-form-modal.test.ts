import { describe, expect, it } from "vitest";
import { parseProductAttributeDefs } from "@scheniders/shared";
import {
    toAttributeKey,
    toWrite,
    validationError,
    fromDef,
    type AttributeFormData,
} from "./attribute-form-modal";

const t = (k: string) => k;

const base: AttributeFormData = {
    key: "scent_family",
    name_en: "Scent family",
    name_ar: "العائلة العطرية",
    kind: "enum",
    options: [{ id: "1", value: "oriental", label_en: "Oriental", label_ar: "شرقي" }],
    groups: [{ id: "1", value: "top", label_en: "Top", label_ar: "المقدمة" }],
    range_min: "1",
    range_max: "5",
    unit_en: "of 5",
    unit_ar: "من ٥",
    is_filterable: true,
    is_comparable: true,
    display_order: 0,
};

describe("toAttributeKey", () => {
    it("produces a key the database CHECK accepts", () => {
        // CHECK is ^[a-z][a-z0-9_]{0,62}$
        const ok = /^[a-z][a-z0-9_]{0,62}$/;
        for (const input of ["Scent Family", "  roast level  ", "screen-size", "RAM/GB", "2nd choice"]) {
            const key = toAttributeKey(input);
            if (key) expect(key).toMatch(ok);
        }
    });

    it("strips leading digits rather than producing an invalid key", () => {
        expect(toAttributeKey("2nd choice")).toBe("nd_choice");
    });

    it("returns empty for input with no usable ASCII", () => {
        // An Arabic-only name cannot seed the key — the form asks for it.
        expect(toAttributeKey("العائلة العطرية")).toBe("");
    });

    it("collapses separators and trims trailing underscores", () => {
        expect(toAttributeKey("screen -- size ")).toBe("screen_size");
    });
});

describe("toWrite", () => {
    it("sends only the columns the chosen kind needs", () => {
        const enumWrite = toWrite(base);
        expect(enumWrite.options).toHaveLength(1);
        expect(enumWrite.group_keys).toBeNull();
        expect(enumWrite.range_min).toBeNull();

        const rangeWrite = toWrite({ ...base, kind: "range" });
        expect(rangeWrite.range_min).toBe(1);
        expect(rangeWrite.range_max).toBe(5);
        expect(rangeWrite.options).toBeNull();

        const groupWrite = toWrite({ ...base, kind: "group_list" });
        expect(groupWrite.group_keys).toEqual([
            { key: "top", label_i18n: { en: "Top", ar: "المقدمة" } },
        ]);
        expect(groupWrite.options).toBeNull();

        const boolWrite = toWrite({ ...base, kind: "boolean" });
        expect(boolWrite.options).toBeNull();
        expect(boolWrite.group_keys).toBeNull();
        expect(boolWrite.range_min).toBeNull();
    });

    it("drops blank rows and normalises option values to keys", () => {
        const write = toWrite({
            ...base,
            options: [
                { id: "1", value: "Oriental Woods", label_en: "Oriental", label_ar: "" },
                { id: "2", value: "   ", label_en: "ignored", label_ar: "" },
            ],
        });
        expect(write.options).toEqual([
            { value: "oriental_woods", label_i18n: { en: "Oriental" } },
        ]);
    });

    it("omits a language that was left blank", () => {
        expect(toWrite({ ...base, name_ar: "   " }).name_i18n).toEqual({ en: "Scent family" });
    });

    it("produces a row the storefront parser accepts", () => {
        // The real contract: whatever the editor writes must survive the
        // read-side boundary, or the merchant saves an attribute that never
        // renders.
        for (const kind of ["enum", "range", "group_list", "text", "boolean"] as const) {
            const write = toWrite({ ...base, kind });
            const parsed = parseProductAttributeDefs([{ id: "x", ...write }]);
            expect(parsed, `kind=${kind}`).toHaveLength(1);
            expect(parsed[0].kind).toBe(kind);
        }
    });
});

describe("validationError", () => {
    it("accepts a complete draft", () => {
        expect(validationError(base, t)).toBeNull();
    });

    it("requires a key and a name in at least one language", () => {
        expect(validationError({ ...base, key: "" }, t)).toBe("attributes.error.key");
        expect(validationError({ ...base, name_en: "", name_ar: "" }, t)).toBe("attributes.error.name");
        expect(validationError({ ...base, name_en: "" }, t)).toBeNull();
    });

    it("requires the shape the kind needs", () => {
        expect(validationError({ ...base, options: [] }, t)).toBe("attributes.error.options");
        expect(validationError({ ...base, kind: "group_list", groups: [] }, t)).toBe("attributes.error.groups");
    });

    it("rejects a range that is not ordered or not numeric", () => {
        expect(validationError({ ...base, kind: "range", range_max: "1" }, t)).toBe("attributes.error.rangeOrder");
        expect(validationError({ ...base, kind: "range", range_min: "abc" }, t)).toBe("attributes.error.rangeNumbers");
    });

    it("does not demand options for kinds that have none", () => {
        expect(validationError({ ...base, kind: "text", options: [] }, t)).toBeNull();
        expect(validationError({ ...base, kind: "boolean", options: [] }, t)).toBeNull();
    });
});

describe("fromDef", () => {
    it("round-trips a definition through the form and back", () => {
        for (const kind of ["enum", "range", "group_list", "text", "boolean"] as const) {
            const written = toWrite({ ...base, kind });
            const def = parseProductAttributeDefs([{ id: "x", ...written }])[0];
            const roundTripped = toWrite(fromDef(def));
            expect(roundTripped, `kind=${kind}`).toEqual(written);
        }
    });
});
