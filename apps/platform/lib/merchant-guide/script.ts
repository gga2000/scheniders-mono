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
        ar: "لا تشيل هم شكل المحل هسه. انشره، وبعدين نرجعله سوه ونخليه حلو وعلى ذوقك.",
        en: "Don't worry about how the shop looks yet. Publish it, and later we'll come back and make it beautiful, your way.",
    },
    "done.title": {
        ar: "عاشت إيدك! محلك صار مفتوح للناس.",
        en: "Well done! Your shop is open to everyone.",
    },
    "done.share": {
        ar: "هذا رابط محلك. انسخه وحطه بالبايو، وشاركه بالانستغرام والتيك توك.",
        en: "Here's your shop link. Copy it into your bio and share it on Instagram and TikTok.",
    },
    "fo.offer": {
        ar: "أول مرة بصفحة الطلبات؟ سوينالك ٣ طلبات تجربة، تعال نمشي بيها سوه.",
        en: "First time on Orders? We made you 3 practice orders. Let's walk through them together.",
    },
    "fo.statuses": {
        ar: "كل طلب يمشي بهالمراحل من اليسار لليمين. «مكتمل» يعني الفلوس وصلتك بإيدك.",
        en: "Every order moves through these stages, left to right. Completed means the money is in your hand.",
    },
    "fo.confirm": {
        ar: "هذا طلب تجربة من محلك. أكّده من هنا مثل أي طلب حقيقي.",
        en: "This is a practice order from your shop. Confirm it here, like a real one.",
    },
    "fo.whatsapp": {
        ar: "من يوصل طلب، الواتساب يدز للزبون رسالة تأكيد وحده. يضغط تأكيد، الطلب يتأكد بدون ما تتصل.",
        en: "When an order comes in, WhatsApp sends the customer a confirmation by itself. They tap Confirm, and the order is confirmed without a call.",
    },
    "fo.whatsappOff": {
        ar: "الإرسال التلقائي طافي هسه. اضغط زر الواتساب اللي فوق حتى يشتغل.",
        en: "Auto-send is off right now. Tap the WhatsApp button at the top to turn it on.",
    },
    "fo.dispatch": {
        ar: "مكتب الشحن تجيه آخر اليوم: تطبع كل الوصولات مرة وحدة، وتسلمها للمندوب.",
        en: "Come to the dispatch desk at the end of the day: print all the labels at once and hand them to the courier.",
    },
    "fo.done": {
        ar: "عاشت إيدك! هيچ يمشي يومك. اضغط «خلصنا» وتنشال طلبات التجربة، وإنت جاهز للطلبات الحقيقية.",
        en: "Well done! That's your day. Tap Finish and the practice orders go away. You're ready for real ones.",
    },
    "fo.expired": {
        ar: "طلبات التجربة خلص وقتها وانشالت. تكدر ترجع تجربها بأي وقت.",
        en: "The practice orders ran out of time and were removed. You can try them again any time.",
    },
    "tour.offer": {
        ar: "أول مرة هنا؟ عندي جولة قصيرة لهالصفحة، تريد نمشي بيها؟",
        en: "First time here? I have a short tour of this page. Want to walk through it?",
    },
    "tour.done": {
        ar: "عاشت إيدك! خلصت هالمرحلة.",
        en: "Well done! That part is finished.",
    },
    "courier.request": {
        ar: "من هنا تدز رقمك المسجل ببرايم، وفريقنا يربطه ويبلغك.",
        en: "Send the phone number of your Prime account from here, and our team links it and tells you.",
    },
    "courier.sent": {
        ar: "دزينا طلبك. فريقنا يربطه ويبلغك، وإنت كمل.",
        en: "Your request is sent. Our team links it and tells you. Carry on meanwhile.",
    },
    "courier.queues": {
        ar: "كل شي يخص برايم تسويه من صفحة الطلبات. «معالجة» للطلبات اللي تحتاج قرارك، و«راجع» للطلبات الراجعة إلك.",
        en: "You do everything for Prime from the Orders page. Needs action holds orders that need your call, and Returning holds the ones coming back to you.",
    },
    "courier.strip": {
        ar: "تحت كل طلب ويا برايم تشوف رحلة الطرد، وتكدر تذكّر الزبون لو تراسل برايم من نفس المكان.",
        en: "Under each Prime order you see the parcel's journey, and you can remind the customer or message Prime from the same place.",
    },
    "products.low": {
        ar: "الشريط هذا يگلك منو خلص ومنو قرب يخلص. المنتج ما ينسد وحده، إنت تختار تطفيه.",
        en: "This strip shows what ran out and what is about to. A product never closes by itself; you choose to turn it off.",
    },
    "products.count": {
        ar: "«جرد المخزون» تعد بيه البضاعة اللي عندك وتصحح الأرقام.",
        en: "Stock count is where you count what you have and correct the numbers.",
    },
    "money.numbers": {
        ar: "هاي مبيعاتك، وربحك الصافي، والفلوس اللي وصلتك فعلاً.",
        en: "These are your sales, your net profit, and the money that actually reached you.",
    },
    "money.cash": {
        ar: "هنا شكد فلوس بعدها عند شركة التوصيل، وشكد منها متأخرة.",
        en: "Here is how much money the delivery company still holds, and how much of it is late.",
    },
    "money.expense": {
        ar: "المصاريف ضيفها من «التكاليف»، حتى يطلع ربحك صح.",
        en: "Add your expenses under Costs, so your profit comes out right.",
    },
    "customers.groups": {
        ar: "الأزرار فوك تفرز زباينك: VIP، يحتاج تأكيد، خطر مرتفع، محظور.",
        en: "The buttons at the top sort your customers: VIP, needs confirming, high risk, blocked.",
    },
    "customers.ads": {
        ar: "هنا صرف الإعلان. أهم رقم «تكلفة الطلب المسلّم»: شكد دفعت على كل طلب وصل فعلاً.",
        en: "This is your ad spend. The number that matters most is cost per delivered order: what you paid for each order that actually arrived.",
    },
    "customers.reports": {
        ar: "التقارير تگلك وين المشكلة، مثل عناوين ناقصة لو زباين ما يردون.",
        en: "Reports tell you where the problem is, like missing addresses or customers who don't answer.",
    },
    "team.invite": {
        ar: "ضيف الموظف من هنا، وكل واحد ياخذ دوره وما يشوف الفلوس.",
        en: "Add a staff member from here. Each one gets their role and doesn't see the money.",
    },
    "till.signin": {
        ar: "كل موظف يختار اسمه ويكتب رمزه، وبعدها يبدي يبيع.",
        en: "Each staff member picks their name and types their code, then starts selling.",
    },
    "look.start": {
        ar: "هسه نخلي محلك حلو وعلى ذوقك. اختار إطلالة جاهزة، وبعدين غير اللي تريده.",
        en: "Now let's make your shop look the way you like. Pick a ready look, then change whatever you want.",
    },
    "staff.hello": {
        ar: "هلا بيك! هاي صفحاتك. أشرحلك كل وحدة بدقيقة.",
        en: "Welcome! These are your pages. I'll explain each one in a minute.",
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
