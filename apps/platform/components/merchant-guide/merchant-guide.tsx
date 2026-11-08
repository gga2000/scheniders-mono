"use client";

// =====================================================================
// MerchantGuide — the setup guide that runs on the app's own pages
// =====================================================================
// Phase 1 ("the basics") walks a new shop owner through four real steps:
// shop name and logo, a first product, delivery prices, and publishing.
// Each step lights up the real field, says one line (Ali's recorded voice,
// or a caption), and ticks only when the shop itself shows it is done
// (lib/merchant-guide/foundation.ts). The basics can't be skipped, but the
// card can be tucked away into the corner pill while the merchant works.
//
// Who sees it: the store's admins, on desktop, on a shop whose basics are
// not finished. A shop that is already complete never sees it, unless
// someone opens any page with ?guide=start to replay it.
//
// Phase 2 ("First order", guide-first-order.tsx) follows once the basics'
// finish card is closed: three practice orders and a walk through a day's
// work on the Orders page and the dispatch desk.
// =====================================================================

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { toast } from "@/hooks/use-toast";
import { nextFoundationStep } from "@/lib/merchant-guide/foundation";
import { STORE_EDITOR_PATH, guideHiddenOn } from "@/lib/merchant-guide/steps";
import { GuideDone } from "./guide-done";
import { GuideAfterBasics } from "./guide-after-basics";
import { GuideFoundationStep } from "./guide-foundation-step";
import { GuideStaffTour } from "./guide-staff-tour";
import { GuideWelcome } from "./guide-welcome";
import { useGuideSetup } from "./guide-setup-store";
import {
    useGuideProgress,
    useGuideShop,
    useSaveGuideProgress,
    type GuidePatch,
} from "./use-merchant-guide-data";

/** The staff tour ships now: staff who joined before it are not interrupted. */
const STAFF_TOUR_SINCE = "2026-11-09T00:00:00Z";

/** Sidebar widths from components/layout/sidebar.tsx, plus its 16px inset and a gap. */
function pillLeftFor(pathname: string, collapsed: boolean): number {
    // The editor has no app sidebar; its own page list is 264px wide.
    if (pathname.startsWith(STORE_EDITOR_PATH)) return 264 + 24;
    return (collapsed ? 72 : 256) + 16 + 24;
}

export function MerchantGuide() {
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, tenantId, role } = useAuth();
    const { language, t } = useLanguage();
    const isMobile = useIsMobile();
    const collapsed = useSidebarCollapsed();
    const locale = language === "ar" ? "ar" : "en";
    const userId = user?.id ?? null;

    const isAdmin = role === "admin";
    // Staff get only their own short tour, and only staff who joined after it shipped.
    const staffTour = !isAdmin && !!role && !!user?.created_at && user.created_at >= STAFF_TOUR_SINCE;
    // The till console hides the guide, except for its own phase after the basics (see GuideAfterBasics).
    const onTill = pathname === "/till";
    const enabled = (isAdmin || staffTour) && !!tenantId && !!userId && !isMobile && (onTill || !guideHiddenOn(pathname));
    const progressQ = useGuideProgress(tenantId, userId, enabled);
    const progress = progressQ.data ?? null;
    const finished = !!progress?.foundation_done_at;
    const shopQ = useGuideShop(tenantId, isAdmin && enabled && progressQ.isSuccess && !progress?.done_seen_at, !!progress && !finished);
    const { save, saving } = useSaveGuideProgress(tenantId, userId);

    const persist = useCallback(
        (patch: GuidePatch) => {
            save(patch).catch(() => toast.error(t("guide.saveFailed")));
        },
        [save, t],
    );

    // ?guide=start replays the guide from the welcome, then drops the flag
    // from the address so a reload doesn't replay it again.
    const replayRequested = searchParams?.get("guide") === "start";
    const replayed = useRef(false);
    useEffect(() => {
        if (!replayRequested || !enabled || !progressQ.isSuccess || replayed.current) return;
        replayed.current = true;
        persist({ answers: {}, foundation_done_at: null, done_seen_at: null, phases: {} });
        const rest = new URLSearchParams(searchParams?.toString());
        rest.delete("guide");
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [replayRequested, enabled, progressQ.isSuccess, persist, searchParams, router, pathname]);

    // ?guide=show (from Settings) brings «دليلك» back after it was hidden.
    const showRequested = searchParams?.get("guide") === "show";
    const shown = useRef(false);
    useEffect(() => {
        if (!showRequested || !enabled || !progressQ.isSuccess || shown.current) return;
        shown.current = true;
        const rest = { ...(progress?.phases ?? {}) };
        delete rest.list_hidden_at;
        persist({ phases: rest });
        const params = new URLSearchParams(searchParams?.toString());
        params.delete("guide");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [showRequested, enabled, progressQ.isSuccess, progress?.phases, persist, searchParams, router, pathname]);

    const status = shopQ.data?.status ?? null;
    const next = status ? nextFoundationStep(status) : null;
    const welcomed = !!progress?.answers.channel;

    // Tell the pages which basics step is running, so the editor and the
    // new-product page can simplify themselves while a new shop sets up.
    const showing = enabled && progressQ.isSuccess && !progress?.done_seen_at;
    const setupStep = showing && welcomed && !finished ? next : null;
    const setStep = useGuideSetup((s) => s.setStep);
    useEffect(() => {
        setStep(setupStep);
        return () => setStep(null);
    }, [setupStep, setStep]);

    // The basics just finished: remember it once, so the guide stops checking.
    const markedDone = useRef(false);
    useEffect(() => {
        if (welcomed && status && next === null && !finished && !markedDone.current) {
            markedDone.current = true;
            persist({ foundation_done_at: new Date().toISOString() });
        }
    }, [welcomed, status, next, finished, persist]);

    if (!enabled || !progressQ.isSuccess || !tenantId) return null;

    const soundOn = progress?.sound_on ?? true;
    const toggleSound = (): void => persist({ sound_on: !soundOn });

    const phases = progress?.phases ?? {};
    if (onTill && (!isAdmin || !progress?.done_seen_at)) return null;
    if (!isAdmin) {
        return (
            <GuideStaffTour
                record={phases.staff}
                locale={locale}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                pillLeft={pillLeftFor(pathname, collapsed)}
                saving={saving}
                onRecord={(staff) => persist({ phases: { ...phases, staff } })}
            />
        );
    }

    // The basics are behind them: the optional phases, their offers and «دليلك».
    if (progress?.done_seen_at) {
        return (
            <GuideAfterBasics
                tenantId={tenantId}
                answers={progress.answers}
                phases={phases}
                locale={locale}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                pillLeft={pillLeftFor(pathname, collapsed)}
                saving={saving}
                onPhases={(next) => persist({ phases: next })}
            />
        );
    }

    if (finished) {
        return (
            <GuideDone
                locale={locale}
                slug={shopQ.data?.slug ?? ""}
                tenantId={tenantId}
                shopName={shopQ.data?.working?.brand_kit?.identity?.name?.trim() ?? ""}
                logoUrl={shopQ.data?.working?.brand_kit?.identity?.logo_url?.trim() ?? ""}
                firstProduct={shopQ.data?.firstProduct ?? null}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                onClose={() => persist({ done_seen_at: new Date().toISOString() })}
            />
        );
    }

    if (!status || !shopQ.data) return null;

    if (!welcomed) {
        // A shop that is already complete is never interrupted.
        if (!progress && next === null) return null;
        return (
            <GuideWelcome
                locale={locale}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                saving={saving}
                onStart={(answers) => persist({ answers })}
            />
        );
    }

    if (next === null) return null;

    return (
        <GuideFoundationStep
            key={next}
            step={next}
            status={status}
            working={shopQ.data.working}
            locale={locale}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            pillLeft={pillLeftFor(pathname, collapsed)}
        />
    );
}
