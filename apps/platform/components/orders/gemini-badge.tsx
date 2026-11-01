import { useId } from "react";

/**
 * Tiny badge that marks an order item as having been auto-extracted via the
 * Telegram bot (Gemini vision parses the customer screenshot). Rendered inline
 * next to the item name in the order cards.
 */
export function GeminiBadge({ size = "sm" }: { size?: "sm" | "xs" }) {
    const dim = size === "xs" ? 10 : 12;
    const gradientId = useId();
    return (
        <span
            title="Auto-extracted by Gemini from chat screenshot"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 text-purple-700 border border-purple-200 dark:text-purple-300 dark:border-purple-500/30 shrink-0"
        >
            {/* Gemini 4-point star glyph */}
            <svg
                width={dim}
                height={dim}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#4285F4" />
                        <stop offset="0.45" stopColor="#9B72CB" />
                        <stop offset="1" stopColor="#D96570" />
                    </linearGradient>
                </defs>
                <path
                    d="M12 2 L13.8 8.4 C14.4 10.5 16 12 18 12.5 L24 14 L18 15.5 C16 16 14.4 17.5 13.8 19.6 L12 26 L10.2 19.6 C9.6 17.5 8 16 6 15.5 L0 14 L6 12.5 C8 12 9.6 10.5 10.2 8.4 Z"
                    transform="translate(0,-2)"
                    fill={`url(#${gradientId})`}
                />
            </svg>
            Gemini
        </span>
    );
}
