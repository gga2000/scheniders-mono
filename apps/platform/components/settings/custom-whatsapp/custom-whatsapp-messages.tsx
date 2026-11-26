"use client";

import { useState } from "react";
import { CUSTOM_TEMPLATE_PURPOSES } from "@scheniders/shared/whatsapp-custom-templates";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { useBilling } from "@/hooks/use-billing";
import { useTenant } from "@/hooks/use-tenant";
import { useCustomWhatsappTemplates } from "@/hooks/use-custom-whatsapp-templates";
import { formatIQD } from "@/lib/utils";
import { isAdminRole } from "@/lib/permissions";
import { CustomTemplateEditor } from "./custom-template-editor";
import { CustomTemplateRow, type EditorStart } from "./custom-template-row";

/**
 * A shop's own wording for Fermi's three automatic order messages, a paid
 * extra (15,000 IQD each time the shop sends a wording for review). Fermi's
 * messages stay free; this card is where a shop writes its own, sees where it
 * stands, and switches between its wording and Fermi's.
 */
export function CustomWhatsappMessages() {
    const { t } = useLanguage();
    const { role } = useAuth();
    const { wallet } = useBilling();
    const isDemo = useTenant().data?.is_demo === true;
    const templates = useCustomWhatsappTemplates();
    const [editing, setEditing] = useState<EditorStart | null>(null);

    // The database lets only the shop's owner or admin pay or switch (is_tenant_admin).
    const isAdmin = isAdminRole(role);

    if (templates.isLoading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
    if (templates.isError || !templates.data) {
        return <p className="text-sm text-rose-600 dark:text-rose-400">{t("customWa.loadError")}</p>;
    }
    const { priceIqd, slots } = templates.data;

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("customWa.hint", { price: formatIQD(priceIqd) })}</p>
            <div className="grid gap-3">
                {CUSTOM_TEMPLATE_PURPOSES.map((purpose) => (
                    <CustomTemplateRow
                        key={purpose}
                        purpose={purpose}
                        slot={slots[purpose]}
                        priceIqd={priceIqd}
                        canEdit={isAdmin && !isDemo}
                        onWrite={setEditing}
                    />
                ))}
            </div>
            {isDemo ? (
                <p className="text-xs text-muted-foreground">{t("customWa.problem.demo")}</p>
            ) : (
                !isAdmin && <p className="text-xs text-muted-foreground">{t("customWa.ownerOnly")}</p>
            )}
            {editing && (
                <CustomTemplateEditor
                    key={editing.purpose}
                    {...editing}
                    priceIqd={priceIqd}
                    balanceIqd={wallet?.balance_iqd ?? null}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
