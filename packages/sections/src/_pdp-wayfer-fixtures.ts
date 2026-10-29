// =====================================================================
// Wayfarer fixtures — scheniders-iraq's ويفر انتنس as read live
// =====================================================================
// The product the PDP redesign is built around (spec: "Product used for
// every example"), copied read-only on 2026-10-30 from the NEW project:
// the description, the five note cards, the `notes` attribute (its only
// scent attribute today) and the six approved reviews, newest first as
// `listApprovedReviews` returns them. Frozen on purpose: the scent card's
// photo pairing (5 of 5) and its quote rule are pinned on these values.
// Commercial fields (price, stock, images) come from `saleProduct`.
// =====================================================================

import { resolveProductAttributes } from "@scheniders/shared";
import type { Product, ReviewSummaryItem } from "./types";
import { saleProduct } from "./_pdp-fixtures";
import { SCENT_DEF_IDS, SCENT_DEFS } from "./_pdp-scent-fixtures";

export const WAYFER_ID = "5e847790-11a5-439f-bace-c315e0ff1ae8";

/** products.description, verbatim (md5 b413b9c23c5d01b0648e340be1c3230e). */
export const WAYFER_DESCRIPTION = [
  "🔥 ملك العطور الجديد ويفر انتنس",
  "",
  "شايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟",
  "",
  "هذا بالضبط اللي راح تحس بيه وية عطر ويفر، اكثر عطر راح تنسأل عليه من ترشه واكثر عطر راح يجيبلك مديح واطراءات",
  "",
  "إحنا ما نبيعلك مجرد \"ريحة حلوة\"، إحنا نبيعلك عطر راح يخليك تسيطر على اي مكان تدخله ويخلي الكل يلتفت من تفوت من يمهم وانت راشه",
  "",
  "انسى العطور اللي تختفي ورة 10 دقايق وتحسسك ذبيت فلوسك بالشارع.",
  "هذا العطر مصمم للرجل اللي يريد يترك \"بصمة\" بالمكان اليدخله بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد متطلع",
  "",
  "🧬 شراح تحس من ترشه؟ (النوتات العطرية):",
  "",
  "المرحلةالمكوناتالتأثير النفسي (شلون راح تبين)",
  "",
  "أول رشة (الانفجار)التوت الفاخر + التفاح الأخضرنكهة فاكهية ومنعشة تخطف الانتباه فوراً. مستحيل تمر بمكان وانت راشه بدون ما ينتبه عليه احد",
  "",
  "القلب (الشخصية)الهيل + اللافندررزانة، فخامة، وهدوء مال رجل واثق من نفسه ويعرف شيريد.",
  "",
  "القاعدة (البصمة)الباتشولي الساحرثبات مرعب. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع",
  "",
  "🚨 العرض اللي ما راح يتكرر (لاول 100 زبون فقط):",
  "",
  "خلي المجازفة علينا مو عليك واشتري العطر هسة وحصل وياه الضمان الذهبي مالتنا",
  "! ضمان لمدة اسبوع كامل على ثبات العطر، فوحانه ورائحته",
  "",
  "خلال 7 ايام من لحظة استلامك العطر اذا ما عجبك باي شكل من الاشكال نرجعلك اياه واحنا الممنونين",
  "",
  "- 💰 السعر: العرض شغّال هسة — السعر بعد الخصم وسعره الأصلي مشطوب، كلهم مبينين فوق",
  "",
  "- 🚚 واصل لباب بيتك: التوصيل سريع لكل محافظات العراق",
  "",
  "- 🧪 جرب قبل لا تفتح: وي كل طلب راح توصلك عينة (تيستر 2 مل).",
  "",
  "- الضمان الذهبي: رش التيستر أول شي.. إذا ما حسيت بالفخامة والفوحان اللي نوعدك بيهم رجع العلبة بيد",
  "",
  "- 🛡️المندوب",
  "",
  "- ، أو استغل الضمان واستعمل العطر لمدة اسبوع كامل وتكدر ترجعه باي لحظة خلال 7 أيام، وفلوسك ترجعلك بدون أي سؤال",
  "!لهل درجة واثقين من العطر",
  "",
  "أنت تستاهل تكون مميز. لا ترضى بالعادي.",
  "",
  "[ اطلبه هسة ولحك على الخصم قبل ميخلص ]",
].join("\n");

const CARD_IMG =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/note-cards/d988d98ad981-";

/** products.feature_cards, verbatim, typos included (the go-live file fixes two). */
export const WAYFER_FEATURE_CARDS = [
  {
    body: "منطي العطر نكهة فاكهية اكثر من فخمة. رائحة التوت راح تخلي اي شخص يشم بيك هلعطر يسألك شنو اسمه",
    title: "🫐 التوت البري الفاخر",
    image_url: `${CARD_IMG}0.jpg`,
  },
  {
    body: "اللمسة التوابلية اللي تنطي عطرك رزانة وطيابة مو طبيعية!",
    title: "🍂 الهيل الملكي",
    image_url: `${CARD_IMG}1.jpg`,
  },
  {
    body: "نكهة اللافندراللي ماكو ثنين يختلفون على انو هي وحدة من اطيب الروائح الممكن تشمها بحياتك، يخلي اللي يكعد يمك يحس براحة وانجذاب بدون ما يعرف السبب.",
    title: "🌿 اللافندر المهدئ",
    image_url: `${CARD_IMG}2.jpg`,
  },
  {
    body: 'سر الثبات المرعب! المكون اللي يكلب العطر من "ريحة طيبة" إلى "بصمة" تشبع بملابسك وتخلي عطرك يفوح لساعات طويلة.',
    title: "🪵 الباتشولي الساحر",
    image_url: `${CARD_IMG}3.jpg`,
  },
  {
    body: 'يكسر حدة العطر بانتعاش حامضي ومميز. يخلي ريحتك "نظيفة" وفرش، مثالي لأجواء الدوام الطويل أو الجامعة.',
    title: "🍏 التفاح الأخضر المقرمش",
    image_url: `${CARD_IMG}4.jpg`,
  },
];

/** The six approved reviews, verbatim. */
export const WAYFER_REVIEWS: ReviewSummaryItem[] = [
  {
    id: "cd25b071-10d9-4de5-a324-ea6a0793559b",
    product_id: WAYFER_ID,
    rating: 3,
    title: null,
    body: "تأخر علية المندوب يومين يلا جابه فدوة نبهو ع مندوبين دهوك العطر كلش راقي وثباته يطول يوم كامل على الملابس جان انطيتكم تقييم 5 نجوم العطر يستاهل 10 نجوم مو بس خمسة بس علمود سالفة التوصيل راح انطيه تلث نجوم",
    author_name: "Ahmed",
    photo_urls: [],
    created_at: "2026-02-24T03:00:00Z",
  },
  {
    id: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "هذا ثاني عطر اطلبه منهم، الاول هذاك بيسفون مدري شسمه  وهسة جربت الانتنس. ريحته حمضيات ع انتعاش ع سوسن بالبداية وبعدين تصير فخمة. تغليفهم يبيض الوجه اذا تريده تهديه.",
    author_name: "حازم السيد",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "aeb344f2-8597-45f7-b639-99973d6f1a6f",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "اللي سوة الفيديو اذا الزمه الة اشبعه كتل، ياخي شبليتني من بلوة اشتريته وخليته بالسيارة بنفس اليوم قطوه مني، مرتي شمته بية تعال اريد منه اخوي شمه تعال جيبلي واحد، هذاك واحد طار وهذن ثنين وصيت واحد الية ولمرتي نشارك بيه والثاني لاخوي اذا منطيتوني هدية نزاعل",
    author_name: "ياسين",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "6881921e-d263-4780-8878-762e01904146",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "بدون مبالغة وكلاوات العيد كريحة العطر جبار الفوحان انطيه 8 ونص من عشرة بس الثبات يا اخي ابدااااااع، كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر وبخيت منه الصبح لسه الريحة تفوح. انصح بي وبشدة للشباب.",
    author_name: "eng. سيف",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "عاشت ايدكم العطر يخبل، جربت التيستر اول شي وكلش عجبتنئ ريحته، العطر صدمني بثباته اهنيكم ع هيج شغل",
    author_name: "مصطفى علي",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "بصراحة جنت خايف اطلب لان الغش ما شاء الله بالبيجات صاير بالجملة، بس وصلتني العلبة مرتبة والتيستر فكرة تخبل. الريحة فخمة مال واحد مدير هههه. شكراً الكم ع المصداقية راح اكرر تجربة الشراء منكم مرة ثانية بس خل ينزل الراتب.",
    author_name: "احمد الشمري",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
];

/** ويفر انتنس: the live notes, cards, description and reviews; no size,
 *  season, occasions, longevity, sillage or longevity_note (to-do 2). */
export const wayferProduct: Product = {
  ...saleProduct,
  id: WAYFER_ID,
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  display_name: "ويفر انتنس",
  gender: "men",
  description: WAYFER_DESCRIPTION,
  short_description: "خصم 24٪ وتوصيل سريع لأول 100 زبون فقط",
  feature_cards: WAYFER_FEATURE_CARDS,
  review_count: 6,
  avg_rating: 28 / 6,
  reviews: WAYFER_REVIEWS,
  attributes: resolveProductAttributes(SCENT_DEFS, [
    {
      product_id: WAYFER_ID,
      attribute_def_id: SCENT_DEF_IDS.notes,
      value: {
        top: ["التوت الفاخر", "التفاح الأخضر"],
        heart: ["الهيل", "اللافندر"],
        base: ["الباتشولي الساحر"],
      },
    },
  ]),
};
