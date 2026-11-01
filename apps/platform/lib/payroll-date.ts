import { format, isValid, type Locale } from "date-fns";

/**
 * Formats a payroll date ("yyyy-mm-dd" or an ISO timestamp). Day keys are read as local
 * midnight so they never shift a day. A value that is not a date is shown as written
 * rather than throwing (date-fns `format` throws on an invalid date).
 */
export function formatPayrollDate(value: string | null | undefined, pattern: string, locale?: Locale): string {
    if (!value) return "";
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    return isValid(date) ? format(date, pattern, { locale }) : value;
}
