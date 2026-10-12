import { describe, it, expect } from "vitest";
import {
    buildDirectSearchFilters,
    foldDigits,
    orderSearchPlacement,
    parseOrderSearchTerm,
    postgrestQuoted,
    rankOrderSearchMatch,
    rankSearchResults,
    storedPhoneVariants,
    type ParsedOrderSearch,
    type RankableOrder,
} from "./order-server-search";

function parsed(term: string): ParsedOrderSearch {
    const p = parseOrderSearchTerm(term);
    if (!p) throw new Error(`"${term}" did not parse`);
    return p;
}

describe("foldDigits", () => {
    it("folds Arabic-Indic and Persian digits to ASCII", () => {
        expect(foldDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
        expect(foldDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
        expect(foldDigits("#۷۵۵۵")).toBe("#7555");
    });

    it("leaves other text alone", () => {
        expect(foldDigits("أحمد 0770")).toBe("أحمد 0770");
    });
});

describe("parseOrderSearchTerm", () => {
    it("is null for terms too short to search", () => {
        expect(parseOrderSearchTerm("")).toBeNull();
        expect(parseOrderSearchTerm("   ")).toBeNull();
        expect(parseOrderSearchTerm("7")).toBeNull();
        expect(parseOrderSearchTerm("#")).toBeNull();
        expect(parseOrderSearchTerm("#5")).toBeNull();
        expect(parseOrderSearchTerm(null)).toBeNull();
    });

    it("strips the '#' the order card prints, so #7555 and #3879 are numbers", () => {
        expect(parsed("#7555")).toMatchObject({ text: "7555", sequence: 7555, phone: "7555", name: null });
        expect(parsed("  # 3879 ")).toMatchObject({ text: "3879", sequence: 3879 });
        expect(parsed("##LF-5361-032")).toMatchObject({ text: "LF-5361-032", sequence: null });
    });

    it("reduces every phone format to the same national digits", () => {
        for (const term of [
            "07701234567",
            "7701234567",
            "+9647701234567",
            "9647701234567",
            "009647701234567",
            "0770 123 4567",
            "0770-123-4567",
            "(0770) 123 4567",
            "٠٧٧٠١٢٣٤٥٦٧",
            "۰۷۷۰۱۲۳۴۵۶۷",
            "+۹۶۴۷۷۰۱۲۳۴۵۶۷",
        ]) {
            expect(parsed(term).phone, term).toBe("7701234567");
        }
    });

    it("does not treat a short number as a phone fragment", () => {
        expect(parsed("077").phone).toBeNull();
        expect(parsed("12").phone).toBeNull();
    });

    it("reads a negative legacy sequence number", () => {
        expect(parsed("#-17").sequence).toBe(-17);
    });

    it("does not read a number too large for an integer column as a sequence", () => {
        expect(parsed("07701234567").sequence).toBeNull();
        expect(parsed("1260630003").sequence).toBeNull();
        expect(parsed("126063000").sequence).toBe(126063000);
    });

    it("treats a term with letters as a possible name, not a phone", () => {
        expect(parsed("أحمد")).toMatchObject({ name: "أحمد", phone: null, sequence: null });
        expect(parsed("Ali 0770").phone).toBeNull();
    });

    it("unwraps a scanned label", () => {
        expect(parsed("QR:7555|PHONE:07701234567").text).toBe("7555");
        expect(parsed("ORDER:LF-5361-032|PHONE:07701234567").text).toBe("LF-5361-032");
    });
});

describe("storedPhoneVariants", () => {
    it("covers the shapes phones are stored in", () => {
        expect(storedPhoneVariants("7701234567")).toEqual(["07701234567", "+9647701234567", "9647701234567", "7701234567"]);
    });
});

describe("postgrestQuoted", () => {
    it("quotes values so reserved characters cannot split an or= filter", () => {
        expect(postgrestQuoted("a,b.(c)")).toBe('"a,b.(c)"');
    });

    it("drops characters that would end the quote or act as wildcards", () => {
        expect(postgrestQuoted('a"b\\c*d%e')).toBe('"abcde"');
    });
});

describe("buildDirectSearchFilters", () => {
    it("searches a typed phone in both phone columns, in every stored shape", () => {
        const { exact, partial } = buildDirectSearchFilters(parsed("0770 123 4567"));
        expect(exact).toContain('phone.in.("07701234567","+9647701234567","9647701234567","7701234567")');
        expect(exact).toContain('secondary_phone.in.("07701234567","+9647701234567","9647701234567","7701234567")');
        expect(partial).toContain('phone.like."*7701234567*"');
        expect(partial).toContain('secondary_phone.like."*7701234567*"');
        expect(partial).not.toContain("customer_name");
    });

    it("searches #order and #sequence numbers exactly, and order ids partially", () => {
        const { exact, partial } = buildDirectSearchFilters(parsed("#3879"));
        expect(exact).toContain("sequence_number.eq.3879");
        expect(exact).toContain('order_id.eq."3879"');
        expect(exact).toContain('order_id.like."LF-3879-*"');
        expect(exact).toContain('delivery_order_id.eq."3879"');
        expect(exact).toContain('waseet_qr_id.eq."3879"');
        expect(partial).toContain('order_id.ilike."*3879*"');
    });

    it("searches a name only when the term has letters", () => {
        const { exact, partial } = buildDirectSearchFilters(parsed("أحمد"));
        expect(partial).toContain('customer_name.ilike."*أحمد*"');
        expect(exact).not.toContain("sequence_number");
        expect(exact).not.toContain("phone");
    });

    it("cannot be broken out of by a hostile term", () => {
        const { exact, partial } = buildDirectSearchFilters(parsed('x",tenant_id.neq.0,"'));
        // The quote is dropped, so the comma stays inside one quoted value.
        expect(exact).toContain('order_id.eq."x,tenant_id.neq.0,"');
        expect(partial).toContain('customer_name.ilike."*x,tenant_id.neq.0,*"');
    });
});

function row(overrides: Partial<RankableOrder> & { id: string }): RankableOrder {
    return { created_at: "2026-10-01T00:00:00.000Z", order_id: "x", phone: "07800000000", ...overrides };
}

describe("rankOrderSearchMatch", () => {
    it("ranks the order the term names first", () => {
        expect(rankOrderSearchMatch(row({ id: "a", sequence_number: 3879 }), parsed("#3879"))).toBe(0);
        expect(rankOrderSearchMatch(row({ id: "a", order_id: "7555" }), parsed("#7555"))).toBe(0);
        expect(rankOrderSearchMatch(row({ id: "a", order_id: "LF-5361-032" }), parsed("5361"))).toBe(0);
        expect(rankOrderSearchMatch(row({ id: "a", waseet_qr_id: "QR123" }), parsed("QR123"))).toBe(0);
    });

    it("ranks an exact phone or secondary phone next, in any stored shape", () => {
        expect(rankOrderSearchMatch(row({ id: "a", phone: "+9647701234567" }), parsed("07701234567"))).toBe(1);
        expect(rankOrderSearchMatch(row({ id: "a", secondary_phone: "07701234567" }), parsed("۰۷۷۰۱۲۳۴۵۶۷"))).toBe(1);
    });

    it("ranks everything else as partial", () => {
        expect(rankOrderSearchMatch(row({ id: "a", order_id: "1260638790" }), parsed("3879"))).toBe(2);
        expect(rankOrderSearchMatch(row({ id: "a", phone: "07701234567" }), parsed("1234567"))).toBe(2);
    });
});

describe("rankSearchResults", () => {
    it("puts an old exact match ahead of newer partial matches, and drops repeats", () => {
        const exact = row({ id: "old", sequence_number: 3879, created_at: "2025-01-01T00:00:00.000Z" });
        const newer = row({ id: "new", order_id: "1260638790", created_at: "2026-10-01T00:00:00.000Z" });
        const newest = row({ id: "newest", order_id: "3879000", created_at: "2026-10-02T00:00:00.000Z" });
        const out = rankSearchResults(parsed("#3879"), [[exact], [newer, exact, newest]], 10);
        expect(out.map(r => r.id)).toEqual(["old", "newest", "new"]);
    });

    it("cuts to the limit after ranking", () => {
        const partials = Array.from({ length: 5 }, (_, i) =>
            row({ id: `p${i}`, order_id: `9${i}3879`, created_at: `2026-10-0${i + 1}T00:00:00.000Z` }),
        );
        const exact = row({ id: "exact", sequence_number: 3879, created_at: "2024-01-01T00:00:00.000Z" });
        expect(rankSearchResults(parsed("3879"), [partials, [exact]], 2).map(r => r.id)).toEqual(["exact", "p4"]);
    });
});

describe("orderSearchPlacement", () => {
    it("labels trashed over archived over active", () => {
        expect(orderSearchPlacement({ is_archived: false, deleted_at: null })).toBe("active");
        expect(orderSearchPlacement({ is_archived: true })).toBe("archived");
        expect(orderSearchPlacement({ is_archived: true, deleted_at: "2026-10-01" })).toBe("trashed");
    });
});
