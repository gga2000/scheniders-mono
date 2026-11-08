"use client";

// The staff tour: a staff member invited from Team gets a short walk over
// only the pages their role can open (never money) on their first login.
// It reuses First order's lines (statuses, WhatsApp, dispatch desk).

import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { canAccessRoute } from "@/lib/route-permissions";
import type { GuideLocale } from "@/lib/merchant-guide/script";
import { STAFF_TOUR_STOPS, nextTourStop, seeStop, type TourRecord } from "@/lib/merchant-guide/tours";
import { GuideNote } from "./guide-note";
import { GuideTour } from "./guide-tour";

export function GuideStaffTour({
    record,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onRecord,
    saving,
}: {
    record: TourRecord | undefined;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    onRecord: (next: TourRecord) => void;
    saving: boolean;
}) {
    const { t } = useLanguage();
    const { role, permissions } = useAuth();
    if (record?.done_at) return null;
    const stops = STAFF_TOUR_STOPS.filter((s) => canAccessRoute(s.path, role, permissions));
    if (stops.length === 0) return null;
    const now = (): string => new Date().toISOString();

    if (!record?.started_at) {
        return (
            <GuideNote
                line="staff.hello"
                title={t("guide.staff.title")}
                locale={locale}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                pillLeft={pillLeft}
                testId="merchant-guide-staff"
                primary={{ label: t("guide.fo.start"), onClick: () => onRecord({ started_at: now(), seen: [] }) }}
                secondary={{ label: t("guide.staff.skip"), onClick: () => onRecord({ done_at: now() }) }}
            />
        );
    }

    const stop = nextTourStop(stops, record);
    if (!stop) return null;
    return (
        <GuideTour
            key={stop.id}
            label={t("guide.staff.title")}
            stop={stop}
            index={stops.indexOf(stop)}
            count={stops.length}
            locale={locale}
            soundOn={soundOn}
            onToggleSound={onToggleSound}
            pillLeft={pillLeft}
            saving={saving}
            onNext={() => onRecord(seeStop(stops, record, stop.id, now()))}
        />
    );
}
