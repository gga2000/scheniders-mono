"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/auth/auth-provider";
import { TelegramLinkCard } from "@/components/settings/telegram-link-card";
import { useLanguage } from "@/hooks/use-language";
import { isAdminRole } from "@/lib/permissions";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { toast } from "@/hooks/use-toast";
import { EmployeeDrawerPanel, type DrawerEmployee, type EmployeeDrawerTab } from "./employee-drawer-panel";
import { EmployeeSalaryPanel } from "./employee-salary-panel";
import { useInfiniteActivities } from "./hooks/use-infinite-activities";
import { useTeamRollup } from "./hooks/use-team-rollup";
import { useWorkSessions } from "./hooks/use-work-sessions";

interface EmployeeDrawerProps {
    employee: DrawerEmployee;
    range: TeamTimeRange;
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (direction: "prev" | "next") => void;
    hasPrev?: boolean;
    hasNext?: boolean;
}

/**
 * Loads one member's own activity (not the store feed's loaded rows) and their window counts,
 * then renders the drawer. Salary and Telegram tabs are admin-only.
 */
export function EmployeeDrawer({ employee, range, isOpen, onClose, onNavigate, hasPrev, hasNext }: EmployeeDrawerProps) {
    const { t } = useLanguage();
    const { role, profile, tenantId } = useAuth();
    const isAdmin = isAdminRole(role);
    const [tab, setTab] = useState<EmployeeDrawerTab>("activity");

    const feed = useInfiniteActivities({ userId: employee.userId, timeRange: range, pageSize: 100 });
    const sessions = useWorkSessions(feed.activities, employee.userId);
    const charts = useTeamRollup({
        timeRange: range,
        tenantId,
        userId: employee.userId,
        enabled: isOpen && tab === "analytics",
        onError: () => toast({ title: t("team.page.errorTitle"), description: t("team.page.errorDesc"), variant: "error" }),
    });
    const name = employee.displayName || employee.email.split("@")[0];

    return (
        <AnimatePresence>
            {isOpen && (
                <EmployeeDrawerPanel
                    key="drawer"
                    employee={employee}
                    range={range}
                    tab={tab}
                    onTabChange={setTab}
                    feed={feed}
                    sessions={sessions}
                    charts={charts}
                    salary={isAdmin ? <EmployeeSalaryPanel employeeId={employee.userId} employeeName={name} role={employee.role} /> : undefined}
                    telegram={isAdmin ? (
                        <TelegramLinkCard
                            userProfileId={employee.userId}
                            currentAdminId={(profile as { id?: string } | null)?.id}
                            displayName={name}
                        />
                    ) : undefined}
                    onClose={onClose}
                    onNavigate={onNavigate}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                />
            )}
        </AnimatePresence>
    );
}
