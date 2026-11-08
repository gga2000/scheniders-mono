// =====================================================================
// Merchant guide — what the guide says, line by line
// =====================================================================
// Every spoken line has a stable id. Ali records one clip per Arabic line
// and saves it as public/guide-voice/<id>.mp3; adding the id to
// RECORDED_LINES turns that clip on. Until then the line is shown as a
// caption only, which is also what English users and muted users get.
// =====================================================================

export type GuideLocale = "ar" | "en";

export interface GuideLine {
    ar: string;
    en: string;
}

export const GUIDE_LINES = {
    "welcome.hello": {
        ar: "هلا بيك بشنايدر! راح نجهز محلك سوه، خطوة بخطوة.",
        en: "Welcome to Schenider! Let's set up your shop together, one step at a time.",
    },
    "welcome.channel": {
        ar: "تشتغل بس أونلاين، لو عندك محل هم؟",
        en: "Do you sell online only, or in a shop too?",
    },
    "welcome.staff": {
        ar: "منو يشتغل وياك؟ بس إنت، لو عندك موظفين؟",
        en: "Who works with you? Just you, or do you have staff?",
    },
    "welcome.go": {
        ar: "تمام، يلا نبدي بالأساس. أربع خطوات وتخلص.",
        en: "Great, let's start with the basics. Four steps and you're done.",
    },
    "shop.name": {
        ar: "أول شي نسمي محلك. اكتب اسمه مثل ما تريد الزباين يشوفوه.",
        en: "First, name your shop. Type it the way you want customers to see it.",
    },
    "shop.logo": {
        ar: "هسه حط اللوگو مالتك. أي صورة واضحة تمشي.",
        en: "Now add your logo. Any clear picture works.",
    },
    "product.name": {
        ar: "هسه نضيف أول منتج. اكتب اسمه مثل ما يشوفه الزبون.",
        en: "Now let's add your first product. Type its name the way a customer would see it.",
    },
    "product.photo": {
        ar: "حط صورة وحدة على الأقل. الزبون ما يشتري شي ما شافه.",
        en: "Add at least one photo. Customers don't buy what they can't see.",
    },
    "product.price": {
        ar: "اكتب السعر بالدينار، بدون كسور.",
        en: "Type the price in dinars, whole numbers only.",
    },
    "product.stock": {
        ar: "كم قطعة عندك منه؟ اكتب العدد بالمخزون.",
        en: "How many do you have? Type the number in stock.",
    },
    "product.save": {
        ar: "احفظ المنتج، وصار أول منتج بمحلك.",
        en: "Save the product, and it's the first one in your shop.",
    },
    "delivery.ask": {
        ar: "سعر التوصيل عندك نفسه لكل المحافظات، لو يختلف من محافظة لمحافظة؟",
        en: "Is your delivery price the same for every governorate, or does it change?",
    },
    "delivery.flat": {
        ar: "اختار «أجرة واحدة لكل المحافظات» واكتب السعر، وينحط لكل المحافظات.",
        en: "Choose one price for all governorates and type it. Every governorate gets it.",
    },
    "delivery.byGov": {
        ar: "اختار «أجرة لكل محافظة». اكتب سعر افتراضي، وبعدين غير بس المحافظات اللي تختلف.",
        en: "Choose a price per governorate. Type a default price, then change only the ones that differ.",
    },
    "open.publish": {
        ar: "كلشي جاهز! اضغط «نشر» حتى يشوف الزباين محلك.",
        en: "Everything's ready! Press Publish so customers can see your shop.",
    },
    "done.title": {
        ar: "خلصت الأساس! محلك جاهز للطلبات.",
        en: "The basics are done! Your shop is ready for orders.",
    },
    "done.share": {
        ar: "هذا رابط محلك. انسخه وحطه بالبايو، وشاركه بالانستغرام والتيك توك.",
        en: "Here's your shop link. Copy it into your bio and share it on Instagram and TikTok.",
    },
} as const satisfies Record<string, GuideLine>;

export type GuideLineId = keyof typeof GUIDE_LINES;

/**
 * Lines that have a recorded clip in public/guide-voice/. Empty until Ali
 * records them: listing an id here is what turns its clip on, so the guide
 * never requests a file that doesn't exist.
 */
export const RECORDED_LINES: ReadonlySet<GuideLineId> = new Set<GuideLineId>([]);

export function guideVoiceSrc(id: GuideLineId): string {
    return `/guide-voice/${id}.mp3`;
}

export function lineText(id: GuideLineId, locale: GuideLocale): string {
    return GUIDE_LINES[id][locale];
}
