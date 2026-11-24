"use client";

import { Suspense, useEffect, useRef, type ComponentType, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useSettingsAttention } from "@/hooks/use-settings-attention";
import { settingsHref, resolveSettingsSection, type SettingsSectionId } from "@/lib/settings-sections";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsOverview } from "@/components/settings/settings-overview";
import { BusinessSettings } from "@/components/settings/business-settings";
import { BillingSettings } from "@/components/settings/billing-settings";
import { OrderReasonsManager } from "@/components/settings/order-reasons-manager";
import { WhatsAppMessagesSettings } from "@/components/settings/whatsapp-messages-settings";
import { DeliveryFeesSummary } from "@/components/settings/delivery-fees-summary";
import { CustomerBlacklist } from "@/components/settings/customer-blacklist";
import { WaseetSettingsPanel } from "@/components/settings/waseet-settings";
import { PrintingSettings } from "@/components/settings/printing-settings";
import { TeamAccessSettings } from "@/components/settings/team-access-settings";
import { StaffAlertsSettings } from "@/components/settings/staff-alerts-settings";
import { AccountSettings } from "@/components/settings/account-settings";

function OrderReasonsSection() {
    const { t } = useLanguage();
    return (
        <div className="space-y-4" data-setting="order-reasons">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.orders.reasons")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.reasons.subtitle")}</p>
            </div>
            <div className="pastel-card p-4">
                <OrderReasonsManager />
            </div>
        </div>
    );
}

function WaseetSection() {
    const { t } = useLanguage();
    return (
        <div className="space-y-4" data-setting="waseet">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.waseet")}</h2>
                <p className="text-sm text-muted-foreground">{t("settings.waseet.subtitle")}</p>
            </div>
            <WaseetSettingsPanel />
        </div>
    );
}

function BlacklistSection() {
    return (
        <div data-setting="blacklist">
            <CustomerBlacklist />
        </div>
    );
}

/** One screen per section; lib/settings-sections.ts holds the list and its groups. */
const SECTION_SCREENS: Record<SettingsSectionId, ComponentType> = {
    overview: SettingsOverview,
    business: BusinessSettings,
    billing: BillingSettings,
    "order-reasons": OrderReasonsSection,
    messages: WhatsAppMessagesSettings,
    "delivery-fees": DeliveryFeesSummary,
    blacklist: BlacklistSection,
    waseet: WaseetSection,
    label: PrintingSettings,
    team: TeamAccessSettings,
    "staff-alerts": StaffAlertsSettings,
    account: AccountSettings,
};

/** How long a section may take to draw the block a link points at before we stop waiting. */
const FOCUS_WAIT_MS = 6000;

/**
 * Scrolls to the `data-setting` block a search result or link names and lights
 * it up for a moment. Sections load their data first, so it waits for the
 * block to appear.
 */
function useFocusSetting(container: RefObject<HTMLElement | null>, section: SettingsSectionId, focus: string | null) {
    useEffect(() => {
        const root = container.current;
        if (!root || !focus) return;
        const selector = `[data-setting="${CSS.escape(focus)}"]`;
        const light = (el: HTMLElement) => {
            // Scroll only the settings pane (scrollIntoView would also move the page around it).
            const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
            root.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
            el.animate(
                [
                    { boxShadow: "0 0 0 3px rgb(251 227 142 / 1)", backgroundColor: "rgb(255 251 235 / 1)" },
                    { boxShadow: "0 0 0 3px rgb(251 227 142 / 0)", backgroundColor: "rgb(255 251 235 / 0)" },
                ],
                { duration: 2400, easing: "ease-out" },
            );
        };
        const found = root.querySelector<HTMLElement>(selector);
        if (found) {
            light(found);
            return;
        }
        const observer = new MutationObserver(() => {
            const el = root.querySelector<HTMLElement>(selector);
            if (!el) return;
            observer.disconnect();
            light(el);
        });
        observer.observe(root, { childList: true, subtree: true });
        const timer = window.setTimeout(() => observer.disconnect(), FOCUS_WAIT_MS);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [container, section, focus]);
}

export default function SettingsPage() {
    return (
        <Suspense fallback={null}>
            <SettingsPageContent />
        </Suspense>
    );
}

function SettingsPageContent() {
    const params = useSearchParams();
    const router = useRouter();
    const { t } = useLanguage();
    const attention = useSettingsAttention();
    const main = useRef<HTMLElement>(null);

    const resolved = resolveSettingsSection(params.get("section"));
    const section = resolved.section;
    const focus = params.get("focus") ?? resolved.focus;
    useFocusSetting(main, section, focus);

    const open = (next: SettingsSectionId, nextFocus?: string) => {
        router.replace(settingsHref(next, nextFocus), { scroll: false });
        if (next !== section) main.current?.scrollTo({ top: 0 });
    };

    const Screen = SECTION_SCREENS[section];

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
            <div className="flex shrink-0 items-center gap-3 px-6 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-(--ink)">
                    <Settings className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-xl font-bold leading-tight text-foreground">{t("settings.page.title")}</h1>
            </div>

            <div className="flex flex-1 gap-5 overflow-hidden px-6 pb-6">
                <div className="w-64 shrink-0 overflow-y-auto pb-2">
                    <SettingsNav active={section} attention={attention} onOpen={open} />
                </div>
                <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
                    <div key={section} className="mx-auto w-full max-w-5xl animate-in fade-in duration-200">
                        <Screen />
                    </div>
                </main>
            </div>
        </div>
    );
}
