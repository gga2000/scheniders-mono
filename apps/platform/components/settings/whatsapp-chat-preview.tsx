import { Fragment, type ReactNode } from "react";
import { fillMessageTemplate } from "@/lib/fill-message-template";
import { SETTINGS_SAMPLE_DISCOUNT_PERCENT, SETTINGS_SAMPLE_ORDER } from "@/lib/settings-sample-order";

const MARK = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

/** WhatsApp's own text marks: *bold*, _italic_, ~struck~. Everything else stays as typed. */
export function renderWhatsAppText(text: string): ReactNode {
    return text.split(MARK).map((part, i) => {
        if (part.length > 2) {
            const inner = part.slice(1, -1);
            if (part.startsWith("*") && part.endsWith("*")) return <strong key={i}>{inner}</strong>;
            if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{inner}</em>;
            if (part.startsWith("~") && part.endsWith("~")) return <s key={i}>{inner}</s>;
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

/**
 * The customer's WhatsApp chat with the shop, showing `content` filled with
 * the sample order exactly as the Orders panel would fill it.
 */
export function WhatsAppChatPreview({
    content,
    storeName,
    emptyText,
}: {
    content: string;
    storeName: string;
    /** Shown in the bubble while the message is empty. */
    emptyText: string;
}) {
    const text = content.trim()
        ? fillMessageTemplate(content, SETTINGS_SAMPLE_ORDER, { discountPercent: SETTINGS_SAMPLE_DISCOUNT_PERCENT, customPrice: null })
        : "";
    return (
        <div aria-hidden className="overflow-hidden rounded-[26px] border-[7px] border-neutral-900 bg-[#EFE7DD]">
            <div className="flex h-11 items-center gap-2 bg-[#075E54] px-3 text-white" dir="rtl">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FBE38E] text-xs font-bold text-neutral-900">
                    {storeName.trim().charAt(0)}
                </span>
                <span className="truncate text-sm font-semibold">{storeName}</span>
            </div>
            <div className="max-h-[55vh] min-h-64 overflow-y-auto p-3" dir="rtl">
                <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-white px-3 py-2 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
                    {text ? (
                        <p className="whitespace-pre-wrap break-words">{renderWhatsAppText(text)}</p>
                    ) : (
                        <p className="text-neutral-400">{emptyText}</p>
                    )}
                    <span className="mt-1 block text-left text-[10px] text-neutral-400">9:41</span>
                </div>
            </div>
        </div>
    );
}
