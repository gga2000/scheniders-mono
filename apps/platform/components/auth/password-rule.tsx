"use client";

import { Check } from "lucide-react";
import { useTextDir } from "@/hooks/use-language";

/** One password rule with a check that turns green once the password meets it. */
export function PasswordRule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    const dir = useTextDir();
    return (
        <li className={`flex items-center gap-2 text-[13px] transition-colors ${ok ? "text-[#15803D]" : "text-[#8A847A]"}`}>
            <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors ${ok ? "bg-[#22C55E] text-white" : "bg-[#ECE8DD] text-transparent"}`}
            >
                <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            <span dir={dir}>{children}</span>
        </li>
    );
}
