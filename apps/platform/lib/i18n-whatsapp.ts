// Strings of WhatsApp billing (Fermi B2): the messages card on the billing
// page, the trial counter, and the order card's "not sent, confirm by hand".
import type { Locale } from "@/lib/i18n";

const en: Record<string, string> = {
    "whatsapp.usage.title": "WhatsApp messages",
    "whatsapp.usage.month": "This month: {count} messages = {amount}",
    "whatsapp.usage.monthCount": "This month: {count} messages",
    "whatsapp.usage.none": "No messages delivered this month yet.",
    "whatsapp.usage.paid": "Each message is taken from your wallet when it reaches the customer. A message that does not arrive costs nothing.",
    "whatsapp.usage.paused": "Your balance does not cover a message, so automatic messages are paused. New orders keep coming in. Top up to turn messages back on.",
    "whatsapp.usage.held": "Automatic messages are paused for your store: most of its recent messages did not reach the customer, often because of wrong numbers. New orders keep coming in: confirm them from your own WhatsApp. Contact support to turn messages back on.",
    "whatsapp.trial.counter": "Trial messages: {sent} of {cap}",
    "whatsapp.trial.free": "Free during the trial, we pay for them. After the trial each message is paid from your wallet.",
    "whatsapp.trial.capped": "The trial's free messages are used up, so automatic messages stopped. Pick a plan and top up your wallet to turn them back on. New orders keep coming in: confirm them from your own WhatsApp.",
    "whatsapp.purpose.confirmation": "Order confirmation",
    "whatsapp.purpose.reminder": "Reminder",
    "whatsapp.purpose.discount": "Discount offer",
    "whatsapp.purpose.deliveryUpdate": "Delivery update",
    "whatsapp.purpose.staffAlert": "New-order alert to staff",
    "whatsapp.purpose.cartRecovery": "Abandoned cart reminder",
    "whatsapp.purpose.other": "Other",
    "orders.card.attn.whatsapp_trial_cap": "Not sent: trial messages used up",
    "orders.card.attn.whatsapp_paused": "Not sent: messages paused",
    "orders.card.confirmByHand": "Confirm by hand",
    "orders.card.confirmByHandTip": "The WhatsApp confirmation was not sent. Send it from your own WhatsApp",
    "orders.filter.whatsappUnsent": "WhatsApp not sent",
    "orders.filter.whatsappUnsentTip": "Orders still waiting for the customer whose automatic WhatsApp did not go out, in the last {days} days",
};

const ar: Record<string, string> = {
    "whatsapp.usage.title": "رسائل الواتساب",
    "whatsapp.usage.month": "هالشهر: {count} رسالة = {amount}",
    "whatsapp.usage.monthCount": "هالشهر: {count} رسالة",
    "whatsapp.usage.none": "بعد ما وصلت رسائل هالشهر.",
    "whatsapp.usage.paid": "كل رسالة تنقص من محفظتك لما توصل للزبون. الرسالة اللي ما توصل ما تنحسب.",
    "whatsapp.usage.paused": "رصيدك ما يكفي لرسالة، فوقفت الرسائل التلقائية. الطلبات الجديدة تبقى توصلك. اشحن المحفظة حتى ترجع الرسائل.",
    "whatsapp.usage.held": "الرسائل التلقائية موقوفة لمتجرك: أغلب رسائله الأخيرة ما وصلت للزبون، غالباً بسبب أرقام غلط. الطلبات الجديدة تبقى توصلك: أكّدها من واتسابك. راسل الدعم حتى ترجع الرسائل.",
    "whatsapp.trial.counter": "رسائل التجربة: {sent} من {cap}",
    "whatsapp.trial.free": "مجانية خلال التجربة، علينا. بعد التجربة كل رسالة تنقص من محفظتك.",
    "whatsapp.trial.capped": "خلصت رسائل التجربة المجانية، فوقفت الرسائل التلقائية. اختر باقة واشحن المحفظة حتى ترجع. الطلبات الجديدة تبقى توصلك: أكّدها من واتسابك.",
    "whatsapp.purpose.confirmation": "تأكيد الطلب",
    "whatsapp.purpose.reminder": "تذكير",
    "whatsapp.purpose.discount": "عرض خصم",
    "whatsapp.purpose.deliveryUpdate": "تحديث التوصيل",
    "whatsapp.purpose.staffAlert": "تنبيه طلب جديد للموظفين",
    "whatsapp.purpose.cartRecovery": "تذكير سلة متروكة",
    "whatsapp.purpose.other": "غيرها",
    "orders.card.attn.whatsapp_trial_cap": "ما انرسلت: خلصت رسائل التجربة",
    "orders.card.attn.whatsapp_paused": "ما انرسلت: الرسائل موقوفة",
    "orders.card.confirmByHand": "أكّد يدوياً",
    "orders.card.confirmByHandTip": "ما انرسل تأكيد واتساب، أكّد يدوياً من واتسابك",
    "orders.filter.whatsappUnsent": "واتساب ما انرسل",
    "orders.filter.whatsappUnsentTip": "طلبات تنتظر الزبون وما انرسل لها واتساب تلقائي، خلال آخر {days} يوماً",
};

export function whatsappTranslations(locale: Locale): Record<string, string> {
    return locale === "ar" ? ar : en;
}
