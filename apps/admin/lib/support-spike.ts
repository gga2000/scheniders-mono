/**
 * "Something is wrong for many shops": several shops writing about the same
 * thing in a short window. Found from the merchants' own words (and the error
 * their screen showed), so staff can post one notice instead of answering the
 * same question twenty times. The notice text is a starting point staff edit.
 */

/** How far back the spotter looks, and how many different shops make a spike. */
export const SPIKE_WINDOW_MINUTES = 30;
export const SPIKE_MIN_SHOPS = 3;

export interface SpikeMessage {
  tenant_id: string;
  body: string;
  context: { errorCode?: string | null } | null;
}

export interface SupportSpike {
  /** A topic key, or `error:<code>` when shops saw the same error. */
  topic: string;
  /** What staff read: "4 shops wrote about delivery". */
  label: string;
  shops: number;
  /** A notice in the merchants' Arabic, ready to edit and post. */
  notice: string;
}

interface Topic {
  key: string;
  label: string;
  words: string[];
  notice: string;
}

/**
 * Words are matched on folded text (see `fold`). "شحن" alone is left out of
 * delivery on purpose: merchants say it for topping up the wallet too.
 */
const TOPICS: Topic[] = [
  {
    key: "delivery",
    label: "delivery",
    words: ["برايم", "prime", "توصيل", "مندوب", "الوسيط", "waseet", "شركه التوصيل", "ما وصل", "ماوصل"],
    notice: "شركة التوصيل متأخرة هسه. الطلبات تطلع بس ممكن توصل متأخرة شوية، ونتابع وياهم.",
  },
  {
    key: "wallet",
    label: "the wallet and payments",
    words: ["محفظه", "رصيد", "شحن المحفظه", "شحن رصيد", "كي كارد", "qi card", "الدفع", "دفعت"],
    notice: "شحن المحفظة والدفع بيهم مشكلة هسه. نشتغل عليها وراح نبلغكم من تنحل.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp messages",
    words: ["واتساب", "واتس", "whatsapp", "رسائل الزبائن"],
    notice: "رسائل الواتساب للزبائن متأخرة هسه. نشتغل عليها وراح نبلغكم من تنحل.",
  },
  {
    key: "login",
    label: "signing in",
    words: ["تسجيل الدخول", "ما يفتح", "مايفتح", "كلمه السر", "الرمز", "otp", "ما اكدر ادخل", "ماكدر ادخل"],
    notice: "بعض المتاجر عدهم مشكلة بالدخول هسه. نشتغل عليها وراح نبلغكم من تنحل.",
  },
];

const ERROR_NOTICE = "بعض الصفحات بيها خلل هسه. نشتغل عليه وراح نبلغكم من ينحل.";

/** Arabic spellings merchants mix: alef forms, taa marbuta, alef maqsura, tashkeel, tatweel; Latin to lower case. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** The biggest spike in these messages (most shops first), or null when none reaches the bar. */
export function findSpike(messages: SpikeMessage[], minShops = SPIKE_MIN_SHOPS): SupportSpike | null {
  const shopsByTopic = new Map<string, Set<string>>();
  const add = (topic: string, tenantId: string) => {
    const shops = shopsByTopic.get(topic) ?? new Set<string>();
    shops.add(tenantId);
    shopsByTopic.set(topic, shops);
  };

  const topics = TOPICS.map((t) => ({ ...t, folded: t.words.map(fold) }));
  for (const message of messages) {
    const text = fold(message.body);
    for (const topic of topics) {
      if (topic.folded.some((word) => text.includes(word))) add(topic.key, message.tenant_id);
    }
    const code = message.context?.errorCode?.trim();
    if (code) add(`error:${code}`, message.tenant_id);
  }

  let best: SupportSpike | null = null;
  for (const [key, shops] of shopsByTopic) {
    if (shops.size < minShops || (best && shops.size <= best.shops)) continue;
    const topic = TOPICS.find((t) => t.key === key);
    const what = topic ? topic.label : `the same error (${key.slice("error:".length)})`;
    best = {
      topic: key,
      label: `${shops.size} shops wrote about ${what} in the last ${SPIKE_WINDOW_MINUTES} min`,
      shops: shops.size,
      notice: topic ? topic.notice : ERROR_NOTICE,
    };
  }
  return best;
}
