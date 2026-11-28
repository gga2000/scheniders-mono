"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import { PrimeConnectHelp } from "./prime-connect-help";
import { latinDigitsValue } from "@/lib/latin-digits-input";

const IRAQI_MOBILE = /^07\d{9}$/;
/** The same rule the server checks: letters, digits and . _ - @, 3 to 40 long. */
const PRIME_LOGIN = /^[A-Za-z0-9._@-]{3,40}$/;

export type PrimeNewAccount = { name: string; phone: string; state: string; loginId: string; password: string };

type Field = "name" | "phone" | "state" | "loginId" | "password";

const INPUT =
    "h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

/**
 * The form a store fills to ask us for a new Prime account: the name and phone
 * Prime will know it by, its governorate, and the login and password it will
 * use in the Prime app. Nothing goes to Prime from here; our team approves it.
 */
export function PrimeNewAccountForm({
    initial,
    pending,
    error,
    onSubmit,
    onBack,
}: {
    initial?: Partial<PrimeNewAccount>;
    pending: boolean;
    error: React.ReactNode;
    onSubmit: (account: PrimeNewAccount) => void;
    onBack: () => void;
}) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const [form, setForm] = useState<PrimeNewAccount>({
        name: initial?.name ?? "",
        phone: initial?.phone ?? "",
        state: initial?.state ?? "",
        loginId: initial?.loginId ?? "",
        password: "",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [invalid, setInvalid] = useState<Field[]>([]);

    const set = (field: Field, value: string) => setForm((f) => ({ ...f, [field]: value }));

    const submit = (e: FormEvent): void => {
        e.preventDefault();
        const phone = normalizeIraqiPhone(form.phone);
        const bad: Field[] = [];
        if (!form.name.trim()) bad.push("name");
        if (!IRAQI_MOBILE.test(phone)) bad.push("phone");
        if (!form.state) bad.push("state");
        if (!PRIME_LOGIN.test(form.loginId.trim())) bad.push("loginId");
        if (form.password.length < 6 || form.password.length > 64) bad.push("password");
        setInvalid(bad);
        if (bad.length > 0) return;
        onSubmit({ ...form, name: form.name.trim(), phone, loginId: form.loginId.trim() });
    };

    const label = (field: Field, key: string) => (
        <label dir={dir} htmlFor={`prime-new-${field}`} className="text-sm font-semibold text-foreground">
            {t(key)}
        </label>
    );
    const hint = (field: Field, key: string) =>
        invalid.includes(field) && (
            <span dir={dir} role="alert" className="text-xs text-red-600">
                {t(key)}
            </span>
        );

    return (
        <form data-guide="prime-request" onSubmit={submit} className="mt-6 grid gap-3 text-left" noValidate>
            <span dir={dir} className="text-sm font-semibold text-foreground">{t("prime.link.new.title")}</span>
            <PrimeConnectHelp path="new" />

            <div className="grid gap-1.5">
                {label("name", "prime.link.new.name")}
                <input id="prime-new-name" dir="auto" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} aria-invalid={invalid.includes("name")} className={INPUT} />
                {hint("name", "prime.link.new.nameInvalid")}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="grid min-w-0 gap-1.5">
                    {label("phone", "prime.link.new.phone")}
                    <input id="prime-new-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXXX" value={form.phone} onChange={(e) => set("phone", latinDigitsValue(e))} aria-invalid={invalid.includes("phone")} className={`${INPUT} tabular-nums`} />
                    {hint("phone", "prime.link.phoneInvalid")}
                </div>
                <div className="grid min-w-0 gap-1.5">
                    {label("state", "prime.link.new.state")}
                    <select id="prime-new-state" value={form.state} onChange={(e) => set("state", e.target.value)} aria-invalid={invalid.includes("state")} className={INPUT}>
                        <option value="" disabled>
                            {t("prime.link.new.statePick")}
                        </option>
                        {IRAQ_GOVERNORATES.map((g) => (
                            <option key={g.oms_code} value={g.oms_code}>
                                {language === "ar" ? g.name : g.name_en}
                            </option>
                        ))}
                    </select>
                    {hint("state", "prime.link.new.stateInvalid")}
                </div>
            </div>

            <div className="grid gap-1.5">
                {label("loginId", "prime.link.new.loginId")}
                <input id="prime-new-loginId" autoComplete="off" autoCapitalize="off" spellCheck={false} value={form.loginId} onChange={(e) => set("loginId", e.target.value)} maxLength={40} aria-invalid={invalid.includes("loginId")} className={INPUT} />
                {hint("loginId", "prime.link.new.loginIdInvalid")}
            </div>

            <div className="grid gap-1.5">
                {label("password", "prime.link.new.password")}
                <div className="relative">
                    <input id="prime-new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} maxLength={64} aria-invalid={invalid.includes("password")} className={`${INPUT} w-full pe-11`} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={t(showPassword ? "prime.link.saved.hide" : "prime.link.saved.show")} className="absolute inset-y-0 end-0 grid w-11 place-items-center text-muted hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                </div>
                {hint("password", "prime.link.new.passwordInvalid")}
            </div>

            <span dir={dir} className="text-xs text-muted">{t("prime.link.new.savedNote")}</span>
            {error}
            <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                {t("prime.link.new.send")}
            </button>
            <button type="button" onClick={onBack} className="text-xs text-muted hover:text-foreground">
                {t("prime.link.back")}
            </button>
        </form>
    );
}
