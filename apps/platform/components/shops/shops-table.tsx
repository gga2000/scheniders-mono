"use client";

import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useSetShopActive, type Shop, type TillMember } from "@/hooks/use-shops";
import { cn } from "@/lib/utils";

interface Props {
    shops: Shop[];
    members: TillMember[];
    onEdit: (shop: Shop) => void;
}

/** One row per shop: name, who works there, phone, and edit / switch off. */
export function ShopsTable({ shops, members, onEdit }: Props) {
    const { t } = useLanguage();
    const setActive = useSetShopActive();
    const nameOf = new Map(members.map((m) => [m.user_id, m.display_name]));

    const toggle = (shop: Shop) =>
        setActive.mutate(
            { id: shop.id, active: !shop.is_active },
            { onError: () => toast({ title: t("till.shops.saveFailed"), variant: "error" }) },
        );

    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="pb-3 font-semibold">{t("till.shops.colShop")}</th>
                    <th className="pb-3 font-semibold">{t("till.shops.colStaff")}</th>
                    <th className="pb-3 font-semibold">{t("till.shops.colPhone")}</th>
                    <th className="pb-3" />
                </tr>
            </thead>
            <tbody>
                {shops.map((shop) => {
                    const staff = shop.staff.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
                    return (
                        <tr key={shop.id} className={cn("border-t border-[var(--card-border)]", !shop.is_active && "opacity-60")}>
                            <td className="py-4 pr-4">
                                <span className="font-semibold text-foreground">{shop.name}</span>
                                {!shop.is_active && (
                                    <span className="ml-2 rounded-full bg-[var(--card-border)] px-2 py-0.5 text-xs font-semibold text-muted">
                                        {t("till.shops.off")}
                                    </span>
                                )}
                                {shop.address && <span className="block text-xs text-muted">{shop.address}</span>}
                            </td>
                            <td className="py-4 pr-4 text-foreground">
                                {staff.length ? staff.join(", ") : <span className="text-muted">{t("till.shops.noStaff")}</span>}
                            </td>
                            <td className="py-4 pr-4 tabular-nums text-foreground">
                                {shop.phone ? formatIraqiPhoneDisplay(shop.phone) : <span className="text-muted">—</span>}
                            </td>
                            <td className="py-4">
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onEdit(shop)}
                                        className="h-12 rounded-full border border-[var(--card-border)] px-5 text-sm font-semibold text-foreground"
                                    >
                                        {t("till.shops.edit")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggle(shop)}
                                        disabled={setActive.isPending}
                                        className="h-12 rounded-full px-4 text-sm font-semibold text-muted hover:text-foreground disabled:opacity-50"
                                    >
                                        {shop.is_active ? t("till.shops.switchOff") : t("till.shops.switchOn")}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
