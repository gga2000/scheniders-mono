import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SalaryOverviewCards } from "@/components/salary/salary-overview-cards";
import { OrderQualityStrip } from "@/components/salary/order-quality-strip";
import { EmployeePayrollCard } from "@/components/salary/employee-payroll-card";
import { SalaryDeductionsTab } from "@/components/salary/salary-deductions-tab";
import { payrollAdvances, payrollBonuses, payrollBreakdown, payrollEmployees, payrollPenalties, payrollPeriod, recentPayment } from "./payroll-fixtures";

const noop = async () => undefined;
const names = new Map(payrollEmployees.map((e) => [e.employee.id, e.employee.displayName ?? e.employee.email]));

/** /salaries "Current period": totals, order quality and one card per member (the page's command bar lives in the container). */
function CurrentPeriod() {
    const totalDue = payrollEmployees.reduce((s, e) => s + e.calculation.netSalary, 0);
    return (
        <div className="min-h-screen bg-[var(--background)] p-6 space-y-3">
            <SalaryOverviewCards
                totalDue={totalDue}
                employeeCount={payrollEmployees.length}
                totalPendingAdvances={payrollAdvances.reduce((s, a) => s + a.amount, 0)}
                totalPendingPenalties={payrollPenalties.reduce((s, a) => s + a.amount, 0)}
            />
            <OrderQualityStrip breakdown={payrollBreakdown} />
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

const meta: Meta = {
    title: "Payroll/Salaries",
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Current: StoryObj = { render: () => <CurrentPeriod /> };
export const Advances: StoryObj = { render: () => <Deductions /> };
