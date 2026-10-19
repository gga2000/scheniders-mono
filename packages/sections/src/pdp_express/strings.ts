// Chrome strings for the pdp_direct_order express layout (generic UI text,
// never merchant claims — those come from props). Kurdish resolves through
// the ar fallback chain, like the classic STRINGS.

export const EXPRESS_STRINGS = {
  formTitle: {
    en: "Your name, number and address — we'll lock in your order",
    ar: "اكتب اسمك ورقمك وعنوانك، ونثبّتلك الطلب",
  },
  greeting: { en: "Welcome, {name}", ar: "هلا {name}، نوّرتنا" },
  addressPrompt: { en: "Where should we deliver?", ar: "وين نوصّلها إلك؟" },
  addressPromptNamed: {
    en: "Where should we deliver, {name}?",
    ar: "وين نوصّلها إلك يا {name}؟",
  },
  nameLabel: { en: "Your name", ar: "اسمك" },
  phoneLabel: { en: "Phone number", ar: "رقم الموبايل" },
  phoneHint: { en: "WhatsApp preferred", ar: "يفضّل عليه واتساب" },
  governorateLabel: { en: "Governorate", ar: "المحافظة" },
  addressLabel: { en: "Area and street", ar: "المنطقة والشارع" },
  addressPlaceholder: {
    en: "e.g. Mansour, 14th Ramadan street",
    ar: "مثال: المنصور، شارع ١٤ رمضان",
  },
  landmarkLabel: { en: "Nearest landmark", ar: "أقرب نقطة دالة" },
  optional: { en: "optional", ar: "اختياري" },
  landmarkPlaceholder: {
    en: "e.g. next to the Al-Rafidain bank",
    ar: "مثال: قرب مصرف الرافدين",
  },
  addAltPhone: { en: "Add a backup number", ar: "أضف رقم ثاني للاحتياط" },
  altPhoneLabel: { en: "Backup number", ar: "رقم ثاني" },
  quantity: { en: "Quantity", ar: "الكمية" },
  payment: { en: "Payment", ar: "الدفع" },
  cashOnDelivery: { en: "Cash on delivery", ar: "كاش عند الاستلام" },
  soonList: { en: "Soon: {list}", ar: "قريباً: {list}" },
  listSep: { en: ", ", ar: "، " },
  qi_card: { en: "Qi Card", ar: "كي كارد" },
  zain_cash: { en: "Zain Cash", ar: "زين كاش" },
  discount: { en: "OFF", ar: "خصم" },
  priceSr: {
    en: "Price {new}, struck price {old}",
    ar: "السعر {new}، والسعر المشطوب {old}",
  },
  youSave: { en: "You save {amount}", ar: "توفّر {amount}" },
  onQty: { en: "on {count} pieces", ar: "على {count} قطع" },
  itemsLine: { en: "{name} × {count}", ar: "{name} × {count}" },
  delivery: { en: "Delivery", ar: "التوصيل" },
  deliveryFreeEverywhere: {
    en: "Free to every governorate",
    ar: "مجاني لكل المحافظات",
  },
  deliveryFree: { en: "Free", ar: "مجاني" },
  deliveryPending: { en: "Choose governorate", ar: "اختر المحافظة" },
  savingsRow: { en: "Your saving", ar: "توفيرك" },
  total: { en: "You pay on delivery", ar: "تدفع عند الاستلام" },
  totalPlain: { en: "Total", ar: "المجموع" },
  submitSubline: {
    en: "{total} · cash on delivery",
    ar: "{total} · كاش عند الاستلام",
  },
  whatsapp: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب" },
  morePhotos: { en: "See {count} photos", ar: "شوف {count} صور" },
  closePhotos: { en: "Close photos", ar: "سكّر الصور" },
  photoOf: { en: "Photo {n} of {total}", ar: "صورة {n} من {total}" },
  pauseRotation: { en: "Pause photos", ar: "وقّف الصور" },
  playRotation: { en: "Play photos", ar: "شغّل الصور" },
  reviews: { en: "{count} reviews", ar: "{count} تقييم" },
  sizeMl: { en: "{n} ml", ar: "{n} مل" },
  clockAria: {
    en: "{label} {h} hours {m} minutes",
    ar: "{label} {h} ساعة و{m} دقيقة",
  },
} as const;

export type ExpressStringKey = keyof typeof EXPRESS_STRINGS;
