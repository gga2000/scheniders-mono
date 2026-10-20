// Chrome strings for the pdp_direct_order express layout (generic UI text,
// never merchant claims — those come from props). Kurdish resolves through
// the ar fallback chain, like the classic STRINGS.

export const EXPRESS_STRINGS = {
  formTitle: {
    en: "Start with your mobile number",
    ar: "اكتب رقم موبايلك ونكمل طلبك",
  },
  phoneShort: {
    en: "The number is short: {count} of 11 digits",
    ar: "الرقم ناقص: {count} من 11 رقم",
  },
  phoneLong: {
    en: "The number is too long: Iraqi mobiles are 11 digits",
    ar: "الرقم أطول من اللازم: رقم الموبايل العراقي 11 رقم",
  },
  phonePrefix: {
    en: "Iraqi mobile numbers start with 07",
    ar: "رقم الموبايل العراقي يبدي بـ 07",
  },
  phoneOperator: {
    en: "Check the number: it should start 075, 077, 078 or 079",
    ar: "تأكد من الرقم: لازم يبدي بـ 075 أو 077 أو 078 أو 079",
  },
  brandLabel: { en: "Brand:", ar: "الشركة:" },
  men: { en: "Men", ar: "رجالي" },
  women: { en: "Women", ar: "نسائي" },
  unisex: { en: "Unisex", ar: "للجنسين" },
  greeting: { en: "Welcome, {name}", ar: "هلا {name}، نوّرتنا" },
  addressPrompt: { en: "Where should we deliver?", ar: "وين نوصّلها إلك؟" },
  addressPromptNamed: {
    en: "Where should we deliver, {name}?",
    ar: "وين نوصّلها إلك يا {name}؟",
  },
  phoneNextHint: {
    en: "Once the number is complete, we'll ask your name and address",
    ar: "بعد ما تكمل الرقم نسألك عن اسمك وعنوانك",
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
  soon: { en: "Soon", ar: "قريباً" },
  qi_card: { en: "Qi Card", ar: "كي كارد" },
  zain_cash: { en: "Zain Cash", ar: "زين كاش" },
  discount: { en: "OFF", ar: "خصم" },
  priceSr: {
    en: "Price {new}, struck price {old}",
    ar: "السعر {new}، والسعر المشطوب {old}",
  },
  youSave: { en: "You save {amount}", ar: "توفّر {amount}" },
  onQty: { en: "on {count} pieces", ar: "على {count} قطع" },
  delivery: { en: "Delivery", ar: "التوصيل" },
  deliveryFreeEverywhere: {
    en: "Free to every governorate",
    ar: "مجاني لكل المحافظات",
  },
  deliveryFree: { en: "Free", ar: "مجاني" },
  deliveryPending: { en: "Choose governorate", ar: "اختر المحافظة" },
  savingsRow: { en: "Your saving", ar: "توفيرك" },
  referralRow: { en: "Friend's code", ar: "خصم رمز صديقك", ku: "داشکاندنی کۆدی هاوڕێ" },
  pointsRow: { en: "Your points", ar: "خصم نقاطك", ku: "داشکاندنی خاڵەکانت" },
  totalPlain: { en: "Total", ar: "المجموع" },
  whatsapp: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب" },
  whatsappShort: { en: "WhatsApp", ar: "واتساب" },
  scrollHint: {
    en: "Scroll down to finish your order",
    ar: "انزل لتحت حتى تكمل طلبك",
  },
  morePhotos: { en: "See {count} photos", ar: "شوف {count} صور" },
  photoOf: { en: "Photo {n} of {total}", ar: "صورة {n} من {total}" },
  reviews: { en: "{count} reviews", ar: "{count} تقييم" },
  sizeMl: { en: "{n} ml", ar: "{n} مل" },
  aboutScent: { en: "About the scent", ar: "عن العطر" },
  readMore: { en: "Read more", ar: "اقرأ المزيد" },
  readLess: { en: "Show less", ar: "أقل" },
  trustListLabel: { en: "Our promises", ar: "وعودنا إلك" },
  clockAria: {
    en: "{label} {h} hours {m} minutes",
    ar: "{label} {h} ساعة و{m} دقيقة",
  },
} as const;

export type ExpressStringKey = keyof typeof EXPRESS_STRINGS;
