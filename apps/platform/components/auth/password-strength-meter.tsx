"use client";

import { useLanguage } from "@/hooks/use-language";
import { passwordStrength } from "@/lib/password-policy";

const STRENGTH_COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#16A34A"];

/** Five bars and a word for how hard the password is to guess, updated as it is typed. */
export function PasswordStrengthMeter({ password }: { password: string }) {
    const { t } = useLanguage();
    const score = passwordStrength(password);
    const color = score > 0 ? STRENGTH_COLORS[score - 1] : null;
    return (
        <div className="flex items-center gap-3" data-testid="password-strength">
            <div className="flex gap-1 flex-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((level) => (
                    <div
                        key={level}
                        className="h-1.5 flex-1 rounded-full transition-colors duration-300"
                        style={{ backgroundColor: color && level <= score ? color : "#ECE8DD" }}
                    />
                ))}
            </div>
            <span aria-live="polite" className="text-[12px] font-medium min-w-16 text-right" style={{ color: color ?? "#A8A29E" }}>
                {score > 0 ? t(`pwreset.strength.${score}`) : t("pwreset.new.strength")}
            </span>
        </div>
    );
}
