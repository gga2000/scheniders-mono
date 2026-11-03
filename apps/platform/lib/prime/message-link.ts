type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * «راسل برايم»: WhatsApp with a message about the parcel already written
 * (case number and our order number). No Prime number is known to the app,
 * so staff pick the Prime chat themselves.
 */
export function primeMessageLink(t: Translate, caseId: number, orderNumber: string): string {
    return `https://wa.me/?text=${encodeURIComponent(t("orders.prime.messageText", { caseId, order: orderNumber }))}`;
}
