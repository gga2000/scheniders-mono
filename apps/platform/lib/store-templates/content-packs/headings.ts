// =====================================================================
// Neutral section headings + contact copy for packs that bring none
// =====================================================================
// The signature direction titles its sections ("Why shop with us?",
// "Shop by category", …) and puts a contact card beside its FAQs. A pack
// may word these for its niche; one that doesn't gets these — copy that
// names no store, no niche and no promise, so it is true for any merchant.
//
// Before this existed the fallback was the perfume pack's headings, which
// were Scheniders' own ("ليش شنايدر؟" / "Why Scheniders?"), so every
// merchant who picked the Signature look shipped another store's name.
// =====================================================================

import type { ContentPack, PackContact, PackHeadings } from "./types";

export const NEUTRAL_HEADINGS: PackHeadings = {
    spotlights: {
        eyebrow_i18n: { ar: "الأقسام", en: "Categories" },
        title_i18n: { ar: "تسوّق حسب القسم", en: "Shop by category" },
    },
    collections: {
        eyebrow_i18n: { ar: "مختاراتنا", en: "Our picks" },
        title_i18n: { ar: "اخترناها إلك", en: "Picked for you" },
    },
    testimonials: {
        eyebrow_i18n: { ar: "آراء زبائننا", en: "What our customers say" },
        title_i18n: { ar: "بكلام زبائننا", en: "In our customers' words" },
    },
    pillars: {
        eyebrow_i18n: { ar: "ضماناتنا", en: "Our guarantees" },
        title_i18n: { ar: "ليش تشتري منّا؟", en: "Why shop with us?" },
    },
    pillars_about: {
        eyebrow_i18n: { ar: "مميزاتنا", en: "Highlights" },
        title_i18n: { ar: "شنو يميّزنا؟", en: "What sets us apart" },
    },
    faq: {
        eyebrow_i18n: { ar: "أسئلة وأجوبة", en: "Questions & answers" },
        title_i18n: { ar: "الأسئلة الأكثر شيوعاً", en: "Frequently asked questions" },
        sub_i18n: { ar: "أجوبة أكثر الأسئلة اللي توصلنا", en: "Answers to the questions we hear most" },
        sub_more_i18n: {
            ar: "هنا أجوبة أكثر الأسئلة اللي توصلنا، وإذا تحتاج شي ثاني راسلنا بأي وقت.",
            en: "Answers to the questions we hear most — and you can always message us for more.",
        },
    },
    contact_page: {
        eyebrow_i18n: { ar: "تواصل ويانا", en: "Contact us" },
        title_i18n: { ar: "عندك سؤال؟ خلّي نساعدك", en: "Questions? Let us help" },
        sub_i18n: {
            ar: "راسلنا بأي سؤال ونرد عليك بأسرع وقت، وتكدر تشوف الأسئلة الشائعة هم.",
            en: "Send us any question and we'll get back to you as soon as we can — the FAQ may help too.",
        },
    },
    catalog_i18n: { ar: "منتجاتنا", en: "Our products" },
    see_all_i18n: { ar: "شوفهم كلهم", en: "See them all" },
    see_more_i18n: { ar: "عرض المزيد", en: "Show more" },
    reviews_gallery_i18n: { ar: "من رسائل زبائننا", en: "From our customers' messages" },
};

export const NEUTRAL_CONTACT: PackContact = {
    home: {
        title_i18n: { ar: "عندك سؤال؟", en: "Have a question?" },
        sub_i18n: { ar: "راسلنا على واتساب ونرد عليك بسرعة", en: "Message us on WhatsApp and we'll answer fast" },
        cta_label_i18n: { ar: "راسلنا على واتساب", en: "Chat on WhatsApp" },
    },
    more: {
        title_i18n: { ar: "عندك أسئلة ثانية؟", en: "More questions?" },
        sub_i18n: { ar: "إذا تحتاج معلومات أكثر، راسلنا بأي وقت.", en: "If you need anything else, message us any time." },
        cta_label_i18n: { ar: "تواصل ويانا", en: "Contact us" },
    },
};

/** The headings a pack's store shows: its own, or the neutral set. */
export function resolvePackHeadings(pack: ContentPack): PackHeadings {
    return pack.headings ?? NEUTRAL_HEADINGS;
}

/** The contact-card copy a pack's store shows: its own, or the neutral set. */
export function resolvePackContact(pack: ContentPack): PackContact {
    return pack.contact ?? NEUTRAL_CONTACT;
}
