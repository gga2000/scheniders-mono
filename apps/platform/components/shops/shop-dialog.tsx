"use client";

import { useState } from "react";
import { Check, QrCode, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useSaveShop, type Shop, type TillMember } from "@/hooks/use-shops";
import { shopFormSchema, type ShopFormInput } from "@/lib/till/shop-forms";
import { supabase } from "@/lib/supabase";
import { formatIqdNumber } from "@scheniders/shared";
import { cn } from "@/lib/utils";

interface Props {
    /** null = adding a new shop. */
    shop: Shop | null;
    members: TillMember[];
    onClose: () => void;
}

const FIELD =
    "h-12 w-full rounded-2xl border border-[var(--card-border)] bg-transparent px-4 text-sm text-foreground outline-none focus:border-[var(--ink)] dark:focus:border-[#EFFF00]";

type QrField = "fib_qr_url" | "zaincash_qr_url";
type FieldName = Exclude<keyof ShopFormInput, QrField>;

const QR_MAX_BYTES = 1024 * 1024;

/** Add or edit one shop: its name, address, phone, receipt footer and who works there. */
export function ShopDialog({ shop, members, onClose }: Props) {
    const { t } = useLanguage();
    const save = useSaveShop();
    const [form, setForm] = useState<ShopFormInput>({
        name: shop?.name ?? "",
        address: shop?.address ?? "",
        phone: shop?.phone ?? "",
        receipt_footer: shop?.receipt_footer ?? "",
        daily_goal: shop?.daily_goal ? formatIqdNumber(shop.daily_goal) : "",
        fib_qr_url: shop?.fib_qr_url ?? null,
        zaincash_qr_url: shop?.zaincash_qr_url ?? null,
    });
    const { tenantId } = useAuth();
    const [uploading, setUploading] = useState<QrField | null>(null);

    // The QR goes to the store's public assets: it is shown to customers anyway.
    const uploadQr = async (name: QrField, file: File) => {
        if (!tenantId) return;
        if (!file.type.startsWith("image/") || file.size > QR_MAX_BYTES) {
            toast({ title: t("till.shops.qrTooBig"), variant: "error" });
            return;
        }
        setUploading(name);
        const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
        const path = `${tenantId}/shops/${name === "fib_qr_url" ? "fib" : "zaincash"}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("tenant-assets").upload(path, file, { cacheControl: "3600", upsert: false });
        setUploading(null);
        if (error) {
            toast({ title: t("till.shops.qrFailed"), variant: "error" });
            return;
        }
        const { data } = supabase.storage.from("tenant-assets").getPublicUrl(path);
        setForm((f) => ({ ...f, [name]: data.publicUrl }));
    };

    const qrSlot = (name: QrField, label: string) => {
        const url = form[name];
        return (
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[var(--card-border)] p-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--card-border)]/30">
                    {url ? <img src={url} alt="" className="h-full w-full bg-white object-contain" /> : <QrCode className="h-6 w-6 text-muted" aria-hidden="true" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span className="flex gap-2">
                        <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-[var(--card-border)] px-3 text-xs font-semibold text-foreground">
                            {uploading === name ? t("till.shops.qrUploading") : url ? t("till.shops.qrChange") : t("till.shops.qrAdd")}
                            <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                disabled={uploading !== null}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (file) void uploadQr(name, file);
                                }}
                            />
                        </label>
                        {url && (
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, [name]: null }))}
                                aria-label={t("till.shops.qrRemove")}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </span>
                </span>
            </div>
        );
    };
    const [staff, setStaff] = useState<string[]>(shop?.staff ?? []);
    const [errors, setErrors] = useState<Partial<Record<FieldName, true>>>({});

    const set = (field: FieldName) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        setErrors((er) => ({ ...er, [field]: undefined }));
    };

    const toggleStaff = (userId: string) =>
        setStaff((s) => (s.includes(userId) ? s.filter((u) => u !== userId) : [...s, userId]));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = shopFormSchema.safeParse(form);
        if (!parsed.success) {
            const next: Partial<Record<FieldName, true>> = {};
            for (const issue of parsed.error.issues) next[issue.path[0] as FieldName] = true;
            setErrors(next);
            return;
        }
        save.mutate(
            { id: shop?.id, values: parsed.data, staff, previousStaff: shop?.staff ?? [] },
            {
                onSuccess: () => {
                    toast({ title: t("till.shops.saved"), variant: "success" });
                    onClose();
                },
                onError: (err) => {
                    // 23505 = the store already has a shop with this name.
                    const duplicate = typeof err === "object" && err !== null && "code" in err && err.code === "23505";
                    toast({ title: t(duplicate ? "till.shops.nameTaken" : "till.shops.saveFailed"), variant: "error" });
                },
            },
        );
    };

    const field = (name: FieldName, label: string, opts: { hint?: string; error: string; inputMode?: "tel" | "numeric"; maxLength: number }) => (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <input
                value={form[name]}
                onChange={set(name)}
                inputMode={opts.inputMode}
                maxLength={opts.maxLength}
                aria-invalid={errors[name] ? true : undefined}
                className={cn(FIELD, errors[name] && "border-red-500")}
                dir="auto"
            />
            {errors[name] ? (
                <span className="text-left text-xs text-red-600" dir="auto">{opts.error}</span>
            ) : (
                opts.hint && <span className="text-left text-xs text-muted" dir="auto">{opts.hint}</span>
            )}
        </label>
    );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="md:max-w-lg">
                <form onSubmit={submit} className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{shop ? t("till.shops.editTitle") : t("till.shops.addTitle")}</DialogTitle>
                        <DialogDescription className="text-left" dir="auto">{t("till.shops.dialogBody")}</DialogDescription>
                    </DialogHeader>

                    {field("name", t("till.shops.name"), { error: t("till.shops.nameError"), maxLength: 40 })}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {field("address", t("till.shops.address"), { hint: t("till.shops.optional"), error: t("till.shops.tooLong"), maxLength: 200 })}
                        {field("phone", t("till.shops.phone"), {
                            hint: t("till.shops.phoneHint"),
                            error: t("till.shops.phoneError"),
                            inputMode: "tel",
                            maxLength: 20,
                        })}
                        {field("receipt_footer", t("till.shops.footer"), {
                            hint: t("till.shops.footerHint"),
                            error: t("till.shops.tooLong"),
                            maxLength: 200,
                        })}
                        {field("daily_goal", t("till.shops.goal"), {
                            hint: t("till.shops.goalHint"),
                            error: t("till.shops.goalError"),
                            inputMode: "numeric",
                            maxLength: 16,
                        })}
                    </div>

                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1.5 text-sm font-semibold text-foreground">{t("till.shops.payQr")}</legend>
                        <p className="-mt-1 text-left text-xs text-muted" dir="auto">{t("till.shops.payQrHint")}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            {qrSlot("fib_qr_url", t("till.pay.method.fib"))}
                            {qrSlot("zaincash_qr_url", t("till.pay.method.zaincash"))}
                        </div>
                    </fieldset>

                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1.5 text-sm font-semibold text-foreground">{t("till.shops.whoWorks")}</legend>
                        {members.length === 0 ? (
                            <p className="text-xs text-muted">{t("till.shops.noMembers")}</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {members.map((m) => {
                                    const on = staff.includes(m.user_id);
                                    return (
                                        <button
                                            key={m.user_id}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => toggleStaff(m.user_id)}
                                            className={cn(
                                                "inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
                                                on
                                                    ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-[#EFFF00] dark:bg-[#EFFF00] dark:text-[#121212]"
                                                    : "border-[var(--card-border)] text-foreground",
                                            )}
                                        >
                                            {on && <Check className="h-4 w-4" aria-hidden="true" />}
                                            <span dir="auto">{m.display_name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </fieldset>

                    <DialogFooter className="gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-12 rounded-2xl border border-[var(--card-border)] px-5 text-sm font-semibold text-foreground"
                        >
                            {t("till.shops.cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={save.isPending || uploading !== null}
                            className="h-12 rounded-2xl bg-[var(--ink)] px-6 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#EFFF00] dark:text-[#121212]"
                        >
                            {save.isPending ? t("till.shops.saving") : t("till.shops.save")}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
