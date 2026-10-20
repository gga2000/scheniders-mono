import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ verifyAccessToken: vi.fn() }));

import { POST } from "./route";
import { verifyAccessToken } from "@/lib/supabase-server";
import type { StoreCopy } from "@/lib/store-copy";

const i = (ar: string, en: string) => ({ ar, en });
const goodCopy: StoreCopy = {
    hero: { headline: i("قهوتك محمصة طازج", "Coffee roasted fresh"), sub: i("حبوب مختارة ونطحنها على كيفك.", "Chosen beans, ground your way."), cta: i("شوف الحبوب", "See the beans") },
    story: { title: i("منو احنا", "Who we are"), body: i("محمصة صغيرة بالكرادة نشتري حبوبنا بأنفسنا.", "A small roastery in Karrada that buys its own beans.") },
    about: { title: i("محمصة صغيرة", "A small roastery"), body: i("نحمّص بكميات صغيرة.", "We roast in small batches.") },
    founder: { quote: i("ما نبيع قهوة ما نشربها.", "We don't sell coffee we wouldn't drink.") },
    pillars: [
        { title: i("تحميص طازج", "Fresh roast"), body: i("نحمّص كل أسبوع.", "We roast every week.") },
        { title: i("مطحنة على كيفك", "Ground your way"), body: i("حبوب كاملة أو مطحونة.", "Whole bean or ground.") },
        { title: i("مصدر معروف", "Named source"), body: i("نكتب البلد والمزرعة.", "We name the country and farm.") },
    ],
    trust: [i("تحميص طازج", "Fresh roast"), i("الدفع عند الاستلام", "Cash on delivery"), i("افتح وتأكد", "Check before paying"), i("مطحنة على طلبك", "Ground to order")],
    faq: [
        { q: i("شكد تظل طازجة؟", "How long does it stay fresh?"), a: i("خلي الكيس مسكر وبعيد عن الحرارة.", "Keep the bag sealed and away from heat.") },
        { q: i("أي طحنة أختار؟", "Which grind?"), a: i("إذا مو متأكد اطلب حبوب كاملة.", "If unsure, order whole bean.") },
        { q: i("تجهزون كميات؟", "Do you do bulk?"), a: i("راسلنا على واتساب.", "Message us on WhatsApp.") },
    ],
    bestsellers: { eyebrow: i("الأكثر طلباً", "Most ordered"), heading: i("أكثر حبوبنا طلباً", "Our most-ordered beans"), sub: i("اللي يرجعون له زبائننا.", "What our customers come back for.") },
    tagline: i("قهوة محمصة طازج", "Fresh-roasted coffee"),
};

function anthropicReturns(payload: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(() =>
            Promise.resolve(
                new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }), {
                    headers: { "content-type": "application/json" },
                }),
            ),
        ),
    );
}

const req = (body: unknown, auth = true) =>
    new NextRequestLike(body, auth) as unknown as Parameters<typeof POST>[0];

/** Minimal stand-in: the route reads only headers.get and json(). */
class NextRequestLike {
    headers: Headers;
    #body: unknown;
    constructor(body: unknown, auth: boolean) {
        this.headers = new Headers(auth ? { Authorization: "Bearer t" } : {});
        this.#body = body;
    }
    json() {
        return Promise.resolve(this.#body);
    }
}

const valid = { business_name: "بن الكرادة", sells: "أحمص قهوة بالكرادة وأطحن على الطلب", pack_id: "coffee" };

beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/ai/store-copy", () => {
    it("returns the merchant's copy for a signed-in caller", async () => {
        anthropicReturns(goodCopy);
        const res = await POST(req(valid));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { copy: StoreCopy; pack_id: string };
        expect(body.pack_id).toBe("coffee");
        expect(body.copy.hero.headline.ar).toBe("قهوتك محمصة طازج");
        const sent = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
        expect(sent.model).toBe("claude-opus-5-5");
        expect(sent.output_config.format.type).toBe("json_schema");
    });

    it("refuses copy that invented a delivery time, a price or a discount", async () => {
        for (const bad of [
            { ...goodCopy, hero: { ...goodCopy.hero, sub: i("توصيل خلال 24 ساعة", "Delivered in 24 hours") } },
            { ...goodCopy, tagline: i("قهوة من 5000 دينار", "Coffee from 5000 IQD") },
            { ...goodCopy, bestsellers: { ...goodCopy.bestsellers, eyebrow: i("خصم 20%", "20% off") } },
        ]) {
            anthropicReturns(bad);
            const res = await POST(req(valid));
            expect(res.status).toBe(502);
            expect((await res.json()).error).toBe("AI returned unusable copy");
        }
    });

    it("refuses a malformed shape rather than seeding half a store", async () => {
        anthropicReturns({ ...goodCopy, pillars: goodCopy.pillars.slice(0, 2) });
        expect((await POST(req(valid))).status).toBe(502);
    });

    it("needs a signed-in caller and a sentence to work from", async () => {
        vi.mocked(verifyAccessToken).mockResolvedValue({ user: null, error: new Error("no") } as never);
        anthropicReturns(goodCopy);
        expect((await POST(req(valid))).status).toBe(401);
        expect((await POST(req(valid, false))).status).toBe(401);

        vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as never);
        expect((await POST(req({ business_name: "x", sells: "" }))).status).toBe(400);
    });

    it("answers a non-JSON body with 400, not a crash", async () => {
        const bad = {
            headers: new Headers({ Authorization: "Bearer t" }),
            json: () => Promise.reject(new SyntaxError("Unexpected token")),
        } as unknown as Parameters<typeof POST>[0];
        expect((await POST(bad)).status).toBe(400);
    });

    it("turns an Anthropic error or an unexpected reply shape into 502", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("overloaded", { status: 529 }))));
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect((await POST(req(valid))).status).toBe(502);
        errSpy.mockRestore();

        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify({ unexpected: true }), { status: 200 }))),
        );
        expect((await POST(req(valid))).status).toBe(502);
    });
});
