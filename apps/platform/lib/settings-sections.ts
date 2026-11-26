/**
 * The Settings page map: which sections exist, how the list groups them, which
 * old `?section=` ids still land somewhere, and the single settings the search
 * box can jump to. Pure data plus two pure helpers, so the page, the overview
 * and the tests all read the same map.
 */

export type SettingsSectionId =
    | "overview"
    | "business"
    | "billing"
    | "order-reasons"
    | "messages"
    | "delivery-fees"
    | "blacklist"
    | "waseet"
    | "label"
    | "team"
    | "staff-alerts"
    | "account";

export type SettingsGroupId = "store" | "orders" | "delivery" | "team" | "you";

export interface SettingsSection {
    id: SettingsSectionId;
    /** null = the overview, shown above the groups. */
    group: SettingsGroupId | null;
    title: string;
}

export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; title: string }[] = [
    { id: "store", title: "settings.group.store" },
    { id: "orders", title: "settings.group.orders" },
    { id: "delivery", title: "settings.group.delivery" },
    { id: "team", title: "settings.group.team" },
    { id: "you", title: "settings.group.you" },
];

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
    { id: "overview", group: null, title: "settings.nav.overview" },
    { id: "business", group: "store", title: "settings.nav.storeInfo" },
    { id: "billing", group: "store", title: "settings.nav.subscription" },
    { id: "order-reasons", group: "orders", title: "settings.orders.reasons" },
    { id: "messages", group: "orders", title: "settings.nav.messages" },
    { id: "delivery-fees", group: "orders", title: "settings.orders.fees" },
    { id: "blacklist", group: "orders", title: "settings.nav.blacklist" },
    { id: "waseet", group: "delivery", title: "settings.nav.waseet" },
    { id: "label", group: "delivery", title: "settings.print.label" },
    { id: "team", group: "team", title: "settings.nav.teamAccess" },
    { id: "staff-alerts", group: "team", title: "settings.nav.staffAlerts" },
    { id: "account", group: "you", title: "settings.nav.account" },
];

/** The backup row in the "you" group opens the Data Vault page itself. */
export const SETTINGS_BACKUP_HREF = "/vault";

/**
 * Ids the old tile page used. Every link in the app, in support answers, in
 * the setup tour and in Qi's payment return still uses some of them, so each
 * lands on its new home (and, where it moved inside a page, on its block).
 */
const LEGACY_SECTIONS: Readonly<Record<string, { section: SettingsSectionId; focus?: string }>> = {
    general: { section: "account" },
    orders: { section: "order-reasons" },
    printing: { section: "label" },
    integrations: { section: "waseet" },
    pages: { section: "team", focus: "page-access" },
    "support-activity": { section: "team", focus: "support-activity" },
    data: { section: "account", focus: "backup" },
};

export function isSettingsSectionId(value: string): value is SettingsSectionId {
    return SETTINGS_SECTIONS.some((s) => s.id === value);
}

/** The Settings link that opens `section` (and lights up the `focus` block in it), keeping any extra params such as `pay=1`. */
export function settingsHref(section: SettingsSectionId, focus?: string | null, extra?: Readonly<Record<string, string>>): string {
    const params = new URLSearchParams({ section });
    if (focus) params.set("focus", focus);
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    return `/settings?${params.toString()}`;
}

/** Where a `?section=` value opens: a current id as is, an old id at its new home, anything else on the overview. */
export function resolveSettingsSection(requested: string | null): { section: SettingsSectionId; focus: string | null } {
    if (requested && isSettingsSectionId(requested)) return { section: requested, focus: null };
    const legacy = requested ? LEGACY_SECTIONS[requested] : undefined;
    if (legacy) return { section: legacy.section, focus: legacy.focus ?? null };
    return { section: "overview", focus: null };
}

/**
 * One thing the search box can find. `focus` is the `data-setting` value of the
 * block it lights up inside its section. `keywords` hold the other words a
 * merchant might type, in both languages, already lower-case.
 */
export interface SettingsSearchEntry {
    focus: string;
    section: SettingsSectionId;
    label: string;
    keywords: readonly string[];
}

export const SETTINGS_SEARCH: readonly SettingsSearchEntry[] = [
    { focus: "store-name", section: "business", label: "settings.biz.name", keywords: ["name", "store name", "shop name", "اسم", "اسم المتجر"] },
    { focus: "store-logo", section: "business", label: "settings.biz.logo", keywords: ["logo", "image", "شعار", "لوكو", "صورة"] },
    { focus: "store-whatsapp", section: "business", label: "settings.biz.whatsapp", keywords: ["whatsapp", "number", "واتساب", "رقم"] },
    { focus: "store-contact", section: "business", label: "settings.biz.phone", keywords: ["phone", "email", "contact", "هاتف", "تلفون", "ايميل", "تواصل"] },
    { focus: "store-address", section: "business", label: "settings.biz.address", keywords: ["address", "city", "location", "عنوان", "مدينة", "محافظة"] },
    { focus: "store-colors", section: "business", label: "settings.hub.colors.title", keywords: ["color", "colour", "brand", "theme", "لون", "الوان", "هوية"] },
    { focus: "wallet", section: "billing", label: "billing.wallet.title", keywords: ["wallet", "balance", "top up", "topup", "pay", "محفظة", "رصيد", "شحن", "دفع"] },
    { focus: "plan", section: "billing", label: "billing.plan.title", keywords: ["plan", "subscription", "upgrade", "باقة", "اشتراك", "خطة"] },
    { focus: "order-reasons", section: "order-reasons", label: "settings.orders.reasons", keywords: ["cancel", "reject", "reason", "الغاء", "رفض", "سبب", "اسباب"] },
    { focus: "templates", section: "messages", label: "settings.orders.templates", keywords: ["template", "message", "whatsapp", "قالب", "قوالب", "رسالة", "رسائل", "واتساب"] },
    { focus: "reminder", section: "messages", label: "settings.orders.reminder", keywords: ["reminder", "follow up", "تذكير", "متابعة"] },
    { focus: "delivery-fees", section: "delivery-fees", label: "settings.orders.fees", keywords: ["delivery", "fee", "shipping", "free delivery", "توصيل", "اجور", "شحن", "مجاني"] },
    { focus: "blacklist", section: "blacklist", label: "settings.nav.blacklist", keywords: ["block", "ban", "blacklist", "fraud", "حظر", "سوداء", "محظور"] },
    { focus: "waseet", section: "waseet", label: "waseet.title", keywords: ["waseet", "alwaseet", "courier", "sync", "الوسيط", "مندوب", "مزامنة", "شركة توصيل"] },
    { focus: "label-fragile", section: "label", label: "settings.print.fragileWarning", keywords: ["fragile", "glass", "label", "كسر", "زجاج", "ملصق"] },
    { focus: "label-shop-logo", section: "label", label: "settings.print.shopLogo", keywords: ["logo", "brand", "label", "شعار", "لوكو", "ملصق"] },
    { focus: "label-customer-note", section: "label", label: "settings.print.customerNote", keywords: ["note", "thanks", "customer", "label", "ملاحظة", "شكر", "زبون", "ملصق"] },
    { focus: "label-no-open", section: "label", label: "settings.print.noOpenWarning", keywords: ["open", "parcel", "package", "sealed", "perfume", "label", "فتح", "طرد", "مسكر", "عطر", "ملصق"] },
    { focus: "team-members", section: "team", label: "settings.hub.team.members", keywords: ["team", "user", "employee", "invite", "role", "staff", "فريق", "موظف", "دعوة", "دور", "مستخدم"] },
    { focus: "page-access", section: "team", label: "settings.pages.title", keywords: ["pages", "access", "permission", "صلاحيات", "صفحات", "وصول"] },
    { focus: "support-activity", section: "team", label: "support.visits.title", keywords: ["support", "activity", "دعم", "نشاط"] },
    { focus: "staff-alerts", section: "staff-alerts", label: "settings.staff.title", keywords: ["alert", "notify", "new order", "تنبيه", "تنبيهات", "طلب جديد"] },
    { focus: "sign-in", section: "account", label: "settings.signin.title", keywords: ["google", "login", "sign in", "password", "passkey", "دخول", "كوكل", "كلمة السر"] },
    { focus: "sounds", section: "account", label: "settings.general.testSounds", keywords: ["sound", "notification", "bell", "صوت", "اصوات", "اشعارات", "جرس"] },
    { focus: "guide", section: "account", label: "guide.settings.title", keywords: ["guide", "tour", "setup", "دليل", "جولة"] },
    { focus: "backup", section: "account", label: "settings.hub.backup.title", keywords: ["backup", "export", "restore", "excel", "csv", "نسخ", "احتياطي", "تصدير", "استرجاع"] },
];

const ARABIC_MARKS = /[ً-ٰٟـ]/g;

/** Lower-case, no Arabic vowel marks or tatweel, one spelling for alef/yeh/teh marbuta, so «أجور» finds «اجور». */
export function normalizeSettingsSearch(text: string): string {
    return text
        .toLowerCase()
        .replace(ARABIC_MARKS, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/ڤ/g, "ف")
        .replace(/گ/g, "ك")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The entries a typed query finds, best first: a label that starts with the
 * query, then a label that contains it, then a keyword match. `translate`
 * turns a label key into the words on screen.
 */
export function searchSettings(query: string, translate: (key: string) => string, limit = 6): SettingsSearchEntry[] {
    const q = normalizeSettingsSearch(query);
    if (!q) return [];
    const ranked: { entry: SettingsSearchEntry; rank: number; order: number }[] = [];
    SETTINGS_SEARCH.forEach((entry, order) => {
        const label = normalizeSettingsSearch(translate(entry.label));
        let rank: number | null = null;
        if (label.startsWith(q)) rank = 0;
        else if (label.includes(q)) rank = 1;
        else if (entry.keywords.some((k) => normalizeSettingsSearch(k).includes(q))) rank = 2;
        if (rank !== null) ranked.push({ entry, rank, order });
    });
    return ranked
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
        .slice(0, limit)
        .map((r) => r.entry);
}
