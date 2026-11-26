"use client";

import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import { Reply } from "lucide-react";
import { CUSTOM_TEMPLATE_BUTTONS, type CustomTemplatePurpose } from "@scheniders/shared/whatsapp-custom-templates";

/** Each message's header picture (lib/interakt TEMPLATE_HEADER_IMAGES), the same on a shop's own wording. */
const HEADER_IMAGES: Record<CustomTemplatePurpose, string> = {
    confirmation: "/whatsapp/order-confirm.png",
    reminder: "/whatsapp/order-reminder.png",
    discount: "/whatsapp/order-discount.png",
};

/** WhatsApp shows *text* in bold; the preview does too. */
function withBold(line: string): ReactNode[] {
    return line.split(/\*([^*\n]+)\*/g).map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
}

/** The message as the customer's phone shows it: picture, text, and the two fixed buttons. */
export function WhatsAppPreview({ purpose, text }: { purpose: CustomTemplatePurpose; text: string }) {
    return (
        <div className="rounded-2xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
            <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-[#202c33]">
                <Image src={HEADER_IMAGES[purpose]} alt="" width={1200} height={628} className="h-auto w-full" />
                <p dir="auto" className="whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-relaxed text-[#111b21] dark:text-[#e9edef]">
                    {text.split("\n").map((line, i) => (
                        <Fragment key={i}>
                            {i > 0 && "\n"}
                            {withBold(line)}
                        </Fragment>
                    ))}
                </p>
            </div>
            <div className="mt-1 grid gap-1">
                {CUSTOM_TEMPLATE_BUTTONS[purpose].map((label) => (
                    <div
                        key={label}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-[13px] font-medium text-[#00a884] shadow-sm dark:bg-[#202c33]"
                    >
                        <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                        <span dir="auto">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
