import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

/**
 * The top of the shop's storefront on a phone: the logo and name the header
 * shows, and the WhatsApp button every "message us" link opens. Drawn from
 * the Store info form as it is being edited.
 */
export function StorefrontPreview({
    name,
    logoUrl,
    whatsapp,
    accent,
}: {
    name: string;
    logoUrl: string | null;
    whatsapp: string;
    /** The storefront's main colour, when the shop has one. */
    accent: string | null;
}) {
    const { t } = useLanguage();
    const shown = name.trim() || t("settings.preview.storeNamePh");
    const number = whatsapp.trim();

    return (
        <div className="space-y-3">
            <div aria-hidden className="overflow-hidden rounded-[26px] border-[7px] border-neutral-900 bg-white">
                <div className="flex h-12 items-center gap-2 border-b border-neutral-200 px-3" dir="rtl">
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the logo may be on any host a merchant pasted; next/image only serves allowlisted hosts
                        <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                        <span
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-neutral-900"
                            style={{ backgroundColor: accent ?? "#FBE38E" }}
                        >
                            {shown.charAt(0)}
                        </span>
                    )}
                    <span className="truncate text-sm font-bold text-neutral-900">{shown}</span>
                </div>
                <div className="relative space-y-2 p-3">
                    <div className="h-28 rounded-xl" style={{ backgroundColor: accent ? `${accent}26` : "#F5F0E8" }} />
                    <div className="grid grid-cols-2 gap-2">
                        <div className="h-16 rounded-lg bg-neutral-100" />
                        <div className="h-16 rounded-lg bg-neutral-100" />
                    </div>
                    <div className="h-2 w-2/3 rounded bg-neutral-100" />
                    {number && (
                        <span className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md">
                            <MessageCircle className="h-5 w-5" />
                        </span>
                    )}
                </div>
            </div>
            {number ? (
                <p className="flex items-center gap-1.5 text-xs text-foreground">
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green-700" />
                    <bdi>{t("settings.preview.whatsappOpens", { number })}</bdi>
                </p>
            ) : (
                <p className="rounded-lg bg-(--pastel-yellow) px-2.5 py-1.5 text-xs text-amber-900">
                    <bdi>{t("settings.preview.whatsappNone")}</bdi>
                </p>
            )}
        </div>
    );
}
