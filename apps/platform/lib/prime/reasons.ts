/**
 * Prime sends its return / postpone reasons as codes (e.g. "CLS"). These are
 * the Arabic labels Prime's own app shows for them, from
 * GET /external/list-of-system-rtn-reasons (prod, 2026-11-05). Prime's labels
 * all start with «تعذر التوصيل - »; the step already says that, so it is cut.
 */
const PRIME_REASON_LABELS: Readonly<Record<string, string>> = {
    CLS: "الهاتف مغلق",
    DENIED: "رفض الطلب",
    NO_ANSWER: "لم يرد",
    AWAY_NOONETO_RCV: "المستلم مسافر",
    WILL_RCV_LATERFROMSNDR: "سيستلم الطلب لاحقًا",
    NOT_CORRECT_SIZE: "الشحنة غير مطابقة",
    RCV_DIFFERENT_STATE: "تغيير عنوان المحافظة",
    ITMS_RCV_ALREADY: "يقول أستلمت الطلب",
    PHONE_NOT_INSERVICE: "غير داخل بالخدمة",
    PRICE_DIFF: "اختلاف السعر",
    RCV_DIFFERENT_FDE: "تغيير عنوان المنطقة",
    NO_WE: "مغلق/لا يرد بعد الاتفاق",
    BLOC_K: "المستلم حاظر المندوب",
    DENIEDARRIVAL: "رفض الطلب بعد وصول للزبون",
};

/** Prime's label for a reason code; text that is not a known code is shown as Prime sent it. */
export function primeReasonLabel(reason: string): string {
    return PRIME_REASON_LABELS[reason.trim()] ?? reason;
}
