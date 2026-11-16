import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const authedFetch = vi.fn();
vi.mock("@/lib/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/lib/supabase", () => ({
    supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "en" }) }));
// The setup-help offer has its own tests; here it would need the support thread.
vi.mock("./setup-help-offer", () => ({ SetupHelpOffer: () => null }));

import { OnboardingWizard } from "./onboarding-wizard";
import { FALLBACK_INDUSTRIES } from "@/lib/wizard-industry-types";

afterEach(cleanup);

const writtenCopy = {
    hero: { headline: { ar: "عطور زهراء", en: "Zahraa scents" }, sub: { ar: "عطور فرنسية", en: "French scents" }, cta: { ar: "تسوق", en: "Shop" } },
    story: { title: { ar: "قصتنا", en: "Our story" }, body: { ar: "نبيع عطوراً فرنسية أصلية", en: "We sell original French perfume" } },
    about: { title: { ar: "من نحن", en: "About" }, body: { ar: "متجر عطور", en: "A perfume shop" } },
    founder: { quote: { ar: "نحب العطور", en: "We love scent" } },
    pillars: [1, 2, 3].map((i) => ({ title: { ar: `ميزة ${i}`, en: `Point ${i}` }, body: { ar: "نص", en: "Text" } })),
    trust: [1, 2, 3, 4].map((i) => ({ ar: `ثقة ${i}`, en: `Trust ${i}` })),
    faq: [1, 2, 3].map((i) => ({ q: { ar: `سؤال ${i}`, en: `Q ${i}` }, a: { ar: "جواب", en: "A" } })),
    bestsellers: { eyebrow: { ar: "الأكثر", en: "Top" }, heading: { ar: "الأكثر مبيعاً", en: "Bestsellers" }, sub: { ar: "اختيارنا", en: "Our pick" } },
    tagline: { ar: "عطرك", en: "Your scent" },
};

function openBasics() {
    render(
        <OnboardingWizard
            tenantId="t1"
            defaultBusinessName="Zahraa"
            industries={FALLBACK_INDUSTRIES}
            businessTypes={[]}
        />,
    );
    fireEvent.click(screen.getByText(FALLBACK_INDUSTRIES[1].name));
    fireEvent.click(screen.getByText("wizard.nav.continue"));
}

describe("the setup wizard's description (Fermi B11)", () => {
    beforeEach(() => {
        authedFetch.mockReset();
    });

    it("writes the store text from what the merchant typed when they leave the box, and waits for it before creating", async () => {
        let answer: (r: Response) => void = () => {};
        authedFetch.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
        openBasics();
        const box = screen.getByTestId("wizard-sells");
        fireEvent.change(box, { target: { value: "عطور فرنسية أصلية" } });
        fireEvent.blur(box);

        expect(authedFetch).toHaveBeenCalledTimes(1);
        const [url, init] = authedFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/ai/store-copy");
        expect(JSON.parse(String(init.body))).toMatchObject({ sells: "عطور فرنسية أصلية", business_name: "Zahraa" });
        expect((screen.getByText("wizard.nav.create").closest("button") as HTMLButtonElement).disabled).toBe(true);

        answer(new Response(JSON.stringify({ copy: writtenCopy }), { status: 200 }));
        await waitFor(() => expect(screen.getByTestId("wizard-copy-ready")).toBeTruthy());
        expect((screen.getByText("wizard.nav.create").closest("button") as HTMLButtonElement).disabled).toBe(false);
    });

    it("does not write again when the merchant leaves the box without changing it", async () => {
        authedFetch.mockResolvedValue(new Response(JSON.stringify({ copy: writtenCopy }), { status: 200 }));
        openBasics();
        const box = screen.getByTestId("wizard-sells");
        fireEvent.change(box, { target: { value: "عطور فرنسية أصلية" } });
        fireEvent.blur(box);
        await waitFor(() => expect(screen.getByTestId("wizard-copy-ready")).toBeTruthy());
        fireEvent.click(screen.getByTestId("wizard-copy-discard"));
        fireEvent.blur(box);
        expect(authedFetch).toHaveBeenCalledTimes(1);
    });

    it("leaves an empty box alone: the store keeps its pack's words", () => {
        openBasics();
        fireEvent.blur(screen.getByTestId("wizard-sells"));
        expect(authedFetch).not.toHaveBeenCalled();
    });
});
