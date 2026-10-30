// =====================================================================
// The Arabic copy term sheet (F12) — one voice, written as data
// =====================================================================
// Every rule names the approved word, what it replaces, and why. The
// rules run over two kinds of text (`_arabic-copy-lint.test.ts`):
//   - "chrome": the `ar` value of every table in STRING_TABLE_FILES and the
//     shared contact-line sentences — code-owned text every tenant sees;
//   - "tenant": the Arabic the PDP redesign writes into scheniders-iraq's
//     draft (`_pdp-redesign-fixtures.ts`, mirrored from the migrations).
// A rule with scope "tenant" never runs over chrome: other tenants' chrome
// may legitimately say what this store's voice does not (عملاء).
//
// The approved action names are data too (COPY_ACTIONS): one name per
// action, everywhere the page offers it.
//
// The Arabic "letter" class includes the Persian letters Iraqi copy uses
// (گ چ پ ڤ) and the harakat, so «ثبّت» or «لگيت» is one word.
// =====================================================================

const AR = "\\u0621-\\u0652\\u0670-\\u06D3";
/** Not preceded by an Arabic letter: the start of a word. */
const START = `(?<![${AR}])`;
/** Not followed by an Arabic letter: the end of a word. */
const END = `(?![${AR}])`;
/** Clitics that may sit in front of a word: و ف ب ل ك, then ال or ل. */
const CLITICS = "(?:[وفبلك])?(?:ال|ل)?";

/** Nouns that follow a number. 3–10 take the plural; a `{count}` slot
 *  cannot know its number, so it needs a `formatCount` forms set. */
const COUNTED_SINGULARS = [
  "تقييم",
  "صورة",
  "قطعة",
  "منتج",
  "عنصر",
  "طلب",
  "نقطة",
  "يوم",
  "ساعة",
  "دقيقة",
  "مرة",
  "زبون",
  "عطر",
  "رقم",
  "أسبوع",
  "شهر",
].join("|");

export type CopyScope = "chrome" | "tenant";

export type CopyRuleId =
  | "customer-word"
  | "guarantee-name"
  | "whatsapp-without-al"
  | "call-us"
  | "hamza"
  | "arabic-comma"
  | "count-slot-singular"
  | "count-3-10-plural"
  | "latin-digits";

export interface CopyRule {
  id: CopyRuleId;
  /** The approved form. */
  use: string;
  /** Why the store writes it this way. */
  reason: string;
  scopes: readonly CopyScope[];
  pattern: RegExp;
  /** One text the rule must catch and its approved rewrite. */
  example: { bad: string; good: string };
}

export const COPY_TERMS: readonly CopyRule[] = [
  {
    id: "customer-word",
    use: "زبون / زبائن",
    reason: "The store's own voice says زبون; عميل/عملاء reads as a bank. Other tenants' chrome may say عملاء, so this runs over the tenant copy only.",
    scopes: ["tenant"],
    pattern: new RegExp(`${START}${CLITICS}(?:عميل|عملاء|عملائ)`, "u"),
    example: { bad: "آراء العملاء", good: "شنو گالوا اللي جرّبوه" },
  },
  {
    id: "guarantee-name",
    use: "كرت الضمان",
    reason: "One name for the guarantee, the one the card's heading and the band's «الشروط» link lead to.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}(?:بطاقة|كارت|كارد) ال?ضمان`, "u"),
    example: { bad: "بطاقة الضمان", good: "كرت الضمان" },
  },
  {
    id: "whatsapp-without-al",
    use: "واتساب",
    reason: "The app's name, written the same way everywhere: «راسلنا واتساب», never «الواتساب».",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}[وفبك]?(?:ال|لل)(?:واتساب|واتس)${END}`, "u"),
    example: { bad: "راسلنا على الواتساب", good: "راسلنا واتساب" },
  },
  {
    id: "call-us",
    use: "اتصل بينا",
    reason: "The store's dialect for the call action, the same words as the contact row's button.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}اتصل بنا${END}`, "u"),
    example: { bad: "اتصل بنا", good: "اتصل بينا" },
  },
  {
    id: "hamza",
    use: "أكثر، أصلي/أصلية، إذا، أسبوع",
    reason: "These four are spelled with their hamza in every line the store writes.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}${CLITICS}(?:اكثر|اصلي|اصلية|اصليه|اذا|ادا|إدا|اسبوع|اسبوعين)${END}`, "u"),
    example: { bad: "الاكثر شيوعا", good: "الأكثر شيوعا" },
  },
  {
    id: "arabic-comma",
    use: "،",
    reason: "Between Arabic words the comma is the Arabic «،», never the Latin «,».",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`[${AR}]\\s*,\\s*[${AR}]`, "u"),
    example: { bad: "المصادر العالمية, ومن", good: "المصادر العالمية، ومن" },
  },
  {
    id: "count-slot-singular",
    use: "a formatCount forms set (one / two / few / many)",
    reason: "«{count} تقييم» is right only for 11 and up; a slot that can hold 3–10 needs the forms set.",
    scopes: ["chrome"],
    pattern: new RegExp(`\\{count\\}\\s+(?:${COUNTED_SINGULARS})${END}`, "u"),
    example: { bad: "{count} تقييم", good: "{count} تقييمات" },
  },
  {
    id: "count-3-10-plural",
    use: "the plural after 3–10",
    reason: "Counts 3 to 10 take the plural noun («6 تقييمات», «3 أيام»); 11 and up take the singular.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`(?<![0-9])(?:[3-9]|10)\\s+(?:${COUNTED_SINGULARS})${END}`, "u"),
    example: { bad: "6 تقييم", good: "6 تقييمات" },
  },
  {
    id: "latin-digits",
    use: "0–9",
    reason: "Latin digits in every shopper-facing number (D5): prices, counts, hours, sizes.",
    scopes: ["chrome", "tenant"],
    pattern: /[٠-٩۰-۹]/u,
    example: { bad: "خلال ٢٤ ساعة", good: "خلال 24 ساعة" },
  },
];

export interface CopyHit {
  rule: CopyRuleId;
  match: string;
}

/** The term-sheet rules `text` breaks, for text of the given scope. */
export function lintArabicCopy(text: string, scope: CopyScope): CopyHit[] {
  const hits: CopyHit[] = [];
  for (const rule of COPY_TERMS) {
    if (!rule.scopes.includes(scope)) continue;
    const m = rule.pattern.exec(text);
    if (m) hits.push({ rule: rule.id, match: m[0] });
  }
  return hits;
}

/** One name per action: the words the page uses for each thing a shopper
 *  can do, wherever it is offered. */
export const COPY_ACTIONS = {
  /** The sticky bar before the form is complete. */
  startOrder: "اطلب الآن",
  /** The form's submit, and the sticky bar once the form is complete. */
  placeOrder: "ثبّت طلبي",
  /** Finishing a half-filled form, from the sticky bar. */
  continueOrder: "كمّل طلبك",
  /** Every WhatsApp contact button: the FAQ row and the sticky icon. */
  whatsapp: "راسلنا واتساب",
  /** Every call button. */
  call: "اتصل بينا",
  /** The promise band's vCard pill. */
  saveNumber: "احفظ رقمنا",
  /** The guarantee terms, by name. */
  guarantee: "كرت الضمان",
} as const;
