import { toast } from "@/hooks/use-toast";
import { generateWhatsAppLink } from "@/lib/utils";

type Translate = (key: string) => string;

/**
 * Opens a wa.me chat in a new tab and reports problems as toasts, not the
 * browser's blocking alert box.
 *
 * When the browser blocks the tab, the link goes to the clipboard; if that
 * fails too, the toast carries an Open button (a click is a user gesture, so
 * the browser lets that tab through).
 *
 * `onOpened` runs once a tab was requested, so the order can record who made
 * contact.
 */
export function openWhatsAppChat(phone: string, message: string, t: Translate, onOpened?: () => void): void {
    const link = generateWhatsAppLink(phone, message);

    const newWindow = window.open(link, "_blank");
    onOpened?.();
    if (newWindow && !newWindow.closed) return;

    const openAgain = { label: t("orders.card.openWhatsApp"), onClick: () => { window.open(link, "_blank"); } };
    navigator.clipboard.writeText(link).then(
        () => toast.warning(t("orders.card.popupBlocked"), { action: openAgain }),
        () => toast.warning(t("orders.card.popupBlockedNoCopy"), { action: openAgain }),
    );
}
