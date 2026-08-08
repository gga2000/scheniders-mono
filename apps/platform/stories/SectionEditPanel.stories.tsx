// =====================================================================
// SectionEditPanel stories — Simple vs Advanced mode (4.4)
// =====================================================================
// Regression net for section authors: the same hero instance rendered
// in both editor modes. Simple must hide logic fields, layers, variants
// and visibility; Advanced must show everything. A testimonials story
// exercises the collapsed-repeater UI.
// =====================================================================

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import type { SectionInstance } from "@scheniders/shared";
import { SectionEditPanel } from "../components/store-builder-v2/section-edit-panel";
import { EditorModeProvider, type EditorMode } from "../lib/editor-mode-context";
import { EditorLocaleProvider } from "../lib/editor-locale-context";

function heroInstance(): SectionInstance {
    return {
        id: "sec-hero-1",
        type: "hero_image",
        enabled: true,
        label: "",
        base: {
            title_i18n: { en: "New collection", ar: "تشكيلة جديدة" },
            subtitle_i18n: { en: "Bold essentials, delivered across Iraq.", ar: "أساسيات بأسلوب جريء، توصيل لكل العراق." },
            cta_label_i18n: { en: "Shop now", ar: "تسوّق الآن" },
            cta_href: "/products",
            image_url: undefined,
            secondary_cta_kind: "none",
            secondary_cta_value: "",
            secondary_cta_label_i18n: { en: "Chat" },
            eyebrow_i18n: { en: "New", ar: "جديد" },
        },
        variants: [],
    };
}

function testimonialsInstance(): SectionInstance {
    return {
        id: "sec-testimonials-1",
        type: "testimonials_carousel",
        enabled: true,
        label: "",
        base: {
            heading_i18n: { en: "What customers say", ar: "ماذا يقول الزبائن" },
            items: [
                {
                    quote_i18n: { ar: "السيروم أصلي — نفس الباركود من موقع الشركة." },
                    author_name: "زهراء",
                },
                {
                    quote_i18n: { ar: "العطر وصل مختوم وبتغليف حلو جداً." },
                    author_name: "نور",
                },
                {
                    quote_i18n: { ar: "جاوبوني على كل أسئلتي بالواتساب قبل ما أطلب." },
                    author_name: "فاطمة",
                },
            ],
        },
        variants: [],
    };
}

/** Stateful harness so edits actually round-trip in the story canvas. */
function PanelHarness({
    mode,
    initial,
}: {
    mode: EditorMode;
    initial: SectionInstance;
}) {
    const [instance, setInstance] = useState<SectionInstance>(initial);
    return (
        <EditorLocaleProvider value="ar">
            <EditorModeProvider value={{ mode, setMode: () => {} }}>
                <div style={{ maxWidth: 380, minHeight: 600 }}>
                    <SectionEditPanel
                        instance={instance}
                        onChange={setInstance}
                        onClose={() => {}}
                        activeLocale="ar"
                        activeBreakpoint="desktop"
                        inline
                    />
                </div>
            </EditorModeProvider>
        </EditorLocaleProvider>
    );
}

const meta: Meta<typeof PanelHarness> = {
    title: "Store Builder/SectionEditPanel",
    component: PanelHarness,
    parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof PanelHarness>;

/** Simple mode: essentials only — no logic fields, layers, variants,
 * visibility or instance label; live-data chips appear instead. */
export const HeroSimple: Story = {
    args: { mode: "simple", initial: heroInstance() },
};

/** Advanced mode: full control surface incl. logic group
 * (secondary_cta_kind), visibility rules and variants. */
export const HeroAdvanced: Story = {
    args: { mode: "advanced", initial: heroInstance() },
};

/** Collapsed repeater rows with Arabic quote summaries + duplicate. */
export const TestimonialsRepeaterSimple: Story = {
    args: { mode: "simple", initial: testimonialsInstance() },
};

export const TestimonialsRepeaterAdvanced: Story = {
    args: { mode: "advanced", initial: testimonialsInstance() },
};
