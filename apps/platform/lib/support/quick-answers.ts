/**
 * Quick answers in the Help chat: the questions merchants ask most, answered
 * in two lines with a button to the page that does it. Shown when the chat is
 * empty, and as the merchant types (best matches first), so a common question
 * is solved before it is sent. The words follow the app's own screens; a
 * change to a screen should change its answer here.
 */

export interface QuickAnswer {
    id: string;
    question: { ar: string; en: string };
    answer: { ar: string; en: string };
    /** The page that does it. */
    href: string;
    /** Words a merchant might type, in either language, already normalized. */
    words: readonly string[];
}

export const QUICK_ANSWERS: readonly QuickAnswer[] = [
    {
        id: "wallet_topup",
        question: { ar: "كيف أشحن محفظتي؟", en: "How do I top up my wallet?" },
        answer: {
            ar: "من الإعدادات، الفواتير: حوّل المبلغ بزين كاش أو كي كارد إلى الرقم الظاهر، وارفع صورة الوصل. نفعّل خلال ساعة بأوقات الدوام.",
            en: "In Settings, Billing: send the amount by Zain Cash or Qi Card to the number shown, then upload the receipt. We approve it within an hour during working hours.",
        },
        href: "/settings?section=billing",
        words: ["شحن", "اشحن", "محفظه", "رصيد", "وصل", "زين كاش", "كي كارد", "تحويل", "top up", "wallet", "balance", "receipt", "zain", "qi"],
    },
    {
        id: "wallet_charges",
        question: { ar: "ليش ينخصم من محفظتي؟", en: "Why is money taken from my wallet?" },
        answer: {
            ar: "المحفظة تدفع الباقة الشهرية وأجور الطلبات المسلَّمة ورسائل واتساب. كل خصم مكتوب في الفواتير.",
            en: "The wallet pays the monthly plan, the fee on delivered orders and WhatsApp messages. Every charge is listed in Billing.",
        },
        href: "/settings?section=billing",
        words: ["خصم", "انخصم", "ينخصم", "فلوس", "اجور", "باقه", "اشتراك", "فاتوره", "charge", "charged", "fee", "plan", "invoice", "subscription"],
    },
    {
        id: "add_product",
        question: { ar: "كيف أضيف منتج؟", en: "How do I add a product?" },
        answer: {
            ar: "من المنتجات اضغط إضافة منتج: الاسم، صورة وحدة على الأقل، السعر بالدينار، والكمية بالمخزون، ثم احفظ.",
            en: "In Products press Add product: the name, at least one photo, the price in dinars and the quantity in stock, then save.",
        },
        href: "/products/new",
        words: ["منتج", "منتجات", "اضيف", "اضافه", "صوره", "سعر", "مخزون", "product", "item", "add", "stock", "price", "photo"],
    },
    {
        id: "team",
        question: { ar: "كيف أضيف موظف؟", en: "How do I add a staff member?" },
        answer: {
            ar: "من الإعدادات، الفريق: ادعُ الموظف واختر دوره وصلاحياته.",
            en: "In Settings, Team: invite them and choose their role and permissions.",
        },
        href: "/settings?section=team",
        words: ["موظف", "موظفين", "فريق", "صلاحيات", "صلاحيه", "دور", "حساب", "staff", "team", "employee", "invite", "permission", "role"],
    },
    {
        id: "prime",
        question: { ar: "كيف أرسل الطلبات لبرايم؟", en: "How do I send orders to Prime?" },
        answer: {
            ar: "اربط برايم من صفحة برايم، وبعدها ترسل الطلبات له مباشرة بدل ملف الإكسل.",
            en: "Link Prime from the Prime page; then orders go to them directly instead of an Excel file.",
        },
        href: "/prime",
        words: ["برايم", "توصيل", "مندوب", "شركه", "اكسل", "شحن الطلب", "prime", "courier", "delivery", "excel", "driver"],
    },
    {
        id: "print_labels",
        question: { ar: "كيف أطبع ملصقات الشحن؟", en: "How do I print shipping labels?" },
        answer: {
            ar: "من صفحة الطباعة اختر الطلبات واطبعها دفعة وحدة. شكل الملصق تغيّره من الإعدادات، الطباعة.",
            en: "On the Printing page pick the orders and print them in one batch. Change the label in Settings, Printing.",
        },
        href: "/printing",
        words: ["طباعه", "اطبع", "ملصق", "ملصقات", "ستيكر", "بوليصه", "طابعه", "print", "label", "sticker", "printer"],
    },
    {
        id: "order_status",
        question: { ar: "كيف أغيّر حالة الطلب؟", en: "How do I change an order's status?" },
        answer: {
            ar: "من صفحة الطلبات اضغط على حالة الطلب ببطاقته واختر الحالة الجديدة.",
            en: "On the Orders page press the status on the order's card and pick the new one.",
        },
        href: "/orders",
        words: ["حاله", "الطلب", "طلب", "طلبات", "مؤكد", "ملغي", "راجع", "status", "order", "orders", "cancel", "confirm", "return"],
    },
    {
        id: "store_look",
        question: { ar: "كيف أغيّر شكل متجري؟", en: "How do I change how my store looks?" },
        answer: {
            ar: "من محرر المتجر غيّر الثيم والأقسام والصور والألوان.",
            en: "In the store editor change the theme, sections, photos and colors.",
        },
        href: "/store/edit",
        words: ["متجر", "شكل", "ثيم", "تصميم", "لون", "الوان", "بانر", "موقع", "store", "theme", "design", "color", "banner", "website"],
    },
    {
        id: "blacklist",
        question: { ar: "كيف أحظر زبون مزعج؟", en: "How do I block an annoying customer?" },
        answer: {
            ar: "من الإعدادات، القائمة السوداء: أضف رقمه، وما يقدر يطلب منك بعد.",
            en: "In Settings, Blacklist: add their number and they can no longer order from you.",
        },
        href: "/settings?section=blacklist",
        words: ["حظر", "احظر", "بلوك", "مزعج", "وهمي", "القائمه السوداء", "block", "blacklist", "ban", "fake", "spam"],
    },
    {
        id: "expense",
        question: { ar: "كيف أسجّل مصروف؟", en: "How do I record an expense?" },
        answer: {
            ar: "من المالية، المصاريف: اضغط إضافة مصروف. ينحسب من صافي ربحك.",
            en: "In Finances, Expenses: press Add expense. It comes off your net profit.",
        },
        href: "/finances?tab=expenses",
        words: ["مصروف", "مصاريف", "ربح", "صافي", "ماليه", "حسابات", "expense", "expenses", "profit", "finance", "cost"],
    },
];

/**
 * Arabic as typed, folded so spellings meet: no tashkeel or tatweel, every
 * alef the same, taa marbuta as haa, alef maqsura as yaa, lower case.
 */
export function foldText(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, "")
        .replace(/[آأإٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, " ")
        .trim();
}

/** The answers that fit what the merchant has typed, best first; none for under two letters. */
export function matchQuickAnswers(draft: string, limit = 3): QuickAnswer[] {
    const text = foldText(draft);
    if (text.length < 2) return [];
    const tokens = text.split(" ").filter((t) => t.length >= 2);
    return QUICK_ANSWERS.map((qa) => {
        const words = qa.words.filter((w) => text.includes(w)).length;
        const question = [foldText(qa.question.ar), foldText(qa.question.en)].join(" ");
        const inQuestion = tokens.filter((t) => t.length >= 3 && question.includes(t)).length;
        return { qa, score: words * 2 + inQuestion };
    })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((m) => m.qa);
}
