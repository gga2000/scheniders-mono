"use client";

import { LifeBuoy } from "lucide-react";
import { useSupportStore } from "@/store/use-support-store";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

interface ContactSupportButtonProps {
    /** The i18n key of the message this button sits under. */
    errorCode: string;
    /** The words the merchant is reading, sent along so staff see them too. */
    errorMessage: string;
    className?: string;
}

/**
 * Sits under an error that tells the merchant to contact support, and does it:
 * opens the support chat with that error already attached.
 */
export function ContactSupportButton({ errorCode, errorMessage, className }: ContactSupportButtonProps) {
    const open = useSupportStore((s) => s.open);
    const { t } = useLanguage();
    return (
        <button
            type="button"
            onClick={() => open({ errorCode, errorMessage })}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-[var(--foreground-muted)] active:scale-95",
                className,
            )}
        >
            <LifeBuoy className="h-4 w-4" />
            {t("support.contactButton")}
        </button>
    );
}
