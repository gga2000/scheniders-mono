import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SalaryOverviewCards } from "@/components/salary/salary-overview-cards";
import { EmployeePayrollCard } from "@/components/salary/employee-payroll-card";
import { SalaryDeductionsTab } from "@/components/salary/salary-deductions-tab";
import { PayrollHistoryTable } from "@/components/salary/payroll-history-table";
import { SalariesCommandBar } from "@/components/salary/salaries-command-bar";
import { SalariesTabBar, type SalariesSort, type SalariesSubTab } from "@/components/salary/salaries-tab-bar";
import { ConfirmPayrollDialog } from "@/components/salary/confirm-payroll-dialog";
import type { OrderAttributionMode, PeriodMode } from "@/hooks/use-salaries";
import { payrollHistory, payrollAdvances, payrollBonuses, payrollBreakdown, payrollEmployees, payrollPenalties, payrollPeriod, recentPayment } from "./payroll-fixtures";

const noop = async () => undefined;
const names = new Map(payrollEmployees.map((e) => [e.employee.id, e.employee.displayName ?? e.employee.email]));

/** /salaries "Current period": command bar, totals, order quality, tab bar and one card per member. */
function CurrentPeriod() {
    const totalDue = payrollEmployees.reduce((s, e) => s + e.calculation.netSalary, 0);
    const [periodMode, setPeriodMode] = useState<PeriodMode>("since_last");
    const [customStart, setCustomStart] = useState(payrollPeriod.start);
    const [customEnd, setCustomEnd] = useState(payrollPeriod.end);
    const [attribution, setAttribution] = useState<OrderAttributionMode>("all");
    const [tab, setTab] = useState<SalariesSubTab>("current");
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<SalariesSort>("name");
    const [showHidden, setShowHidden] = useState(false);
    return (
        <div className="min-h-screen bg-[var(--background)] p-6 space-y-3">
            <SalariesCommandBar
                periodMode={periodMode}
                onPeriodModeChange={setPeriodMode}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
                attributionMode={attribution}
                onAttributionModeChange={setAttribution}
                onRefresh={() => undefined}
                onOpenRoleDefaults={() => undefined}
                payableCount={payrollEmployees.filter((e) => e.calculation.netSalary > 0).length}
                onPayAll={() => undefined}
            />
            <SalaryOverviewCards
                totalDue={totalDue}
                employeeCount={payrollEmployees.length}
                totalPendingAdvances={payrollAdvances.reduce((s, a) => s + a.amount, 0)}
                totalPendingPenalties={payrollPenalties.reduce((s, a) => s + a.amount, 0)}
                breakdown={payrollBreakdown}
                projectedTotal={payrollEmployees.reduce((s, e) => s + e.calculation.inTransit.projectedNet, 0)}
                inTransitOrders={55}
            />
            <SalariesTabBar
                activeTab={tab}
                onTabChange={setTab}
                search={search}
                onSearchChange={setSearch}
                sortBy={sortBy}
                onSortChange={setSortBy}
                exportDisabled={false}
                onExportCsv={() => undefined}
                onExportPdf={() => undefined}
                hiddenCount={1}
                showHidden={showHidden}
                onToggleHidden={() => setShowHidden((v) => !v)}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {payrollEmployees.map((data, i) => (
                    <EmployeePayrollCard
                        key={data.employee.id}
                        index={i}
                        data={data}
                        globalPeriodStart={payrollPeriod.start}
                        globalPeriodEnd={payrollPeriod.end}
                        onAddAdvance={noop}
                        onAddPenalty={noop}
                        onAddBonus={noop}
                        onMarkAsPaid={() => undefined}
                        onVoidPayment={noop}
                        onUpdateConfig={noop}
                        onPeriodOverride={() => undefined}
                        onClearPeriodOverride={() => undefined}
                        onHide={() => undefined}
                        loadConfigHistory={async () => []}
                        hasOverride={false}
                        recentPayments={data.employee.id === "u2" ? [recentPayment] : []}
                    />
                ))}
            </div>
        </div>
    );
}

function Deductions() {
    return (
        <div className="min-h-screen bg-[var(--background)] p-6">
            <SalaryDeductionsTab
                type="advances"
                advances={payrollAdvances}
                penalties={payrollPenalties}
                bonuses={payrollBonuses}
                employeeNames={names}
                onDeleteAdvance={noop}
                onDeletePenalty={noop}
                onDeleteBonus={noop}
            />
        </div>
    );
}

function History() {
    return (
        <div className="min-h-screen bg-[var(--background)] p-6">
            <PayrollHistoryTable records={payrollHistory} loading={false} failed={false} onVoid={async () => ({ error: null })} employeeNames={names} />
        </div>
    );
}

const meta: Meta = {
    title: "Payroll/Salaries",
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Current: StoryObj = { render: () => <CurrentPeriod /> };
export const Advances: StoryObj = { render: () => <Deductions /> };
export const PayrollHistory: StoryObj = { render: () => <History /> };
/** Mark paid with a part-payment typed in: 500,000 of 762,000 now, the rest owed. */
export const MarkPaid: StoryObj = {
    render: () => (
        <div className="min-h-screen bg-[var(--background)]">
            <ConfirmPayrollDialog isOpen data={payrollEmployees[0]} onConfirm={() => undefined} onClose={() => undefined} />
        </div>
    ),
};
