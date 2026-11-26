"use client";

import { TeamSettings } from "@/components/settings/team-settings";
import { PageSettings } from "@/components/settings/pages-settings";
import { SupportVisitsSettings } from "@/components/settings/support-visits-settings";

/** Everything about who works in the shop: members and roles, which page each role opens, and what our support team did here. */
export function TeamAccessSettings() {
    return (
        <div className="space-y-10">
            <div data-setting="team-members">
                <TeamSettings />
            </div>
            <div data-setting="page-access" className="border-t border-(--card-border) pt-8">
                <PageSettings />
            </div>
            <div data-setting="support-activity" className="border-t border-(--card-border) pt-8">
                <SupportVisitsSettings />
            </div>
        </div>
    );
}
