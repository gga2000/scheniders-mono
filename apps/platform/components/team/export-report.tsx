"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Download,
    FileText,
    FileSpreadsheet,
    Loader2,
    CheckCircle,
    Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { useLanguage } from "@/hooks/use-language";

// Types
interface EmployeeData {
    userId: string;
    email: string;
    displayName: string | null;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
    ordersEdited: number;
}

interface ExportReportProps {
    employees: EmployeeData[];
    activities: ActivityLogEntry[];
    selectedEmployeeId?: string;
    dateRange: { from: string; to: string };
    className?: string;
}

type ExportFormat = "pdf" | "excel";
type ExportStatus = "idle" | "exporting" | "success" | "error";

export function ExportReport({
    employees,
    activities,
    selectedEmployeeId,
    dateRange,
    className,
}: ExportReportProps) {
    const { t } = useLanguage();
    const [format, setFormat] = useState<ExportFormat>("pdf");
    const [status, setStatus] = useState<ExportStatus>("idle");
    const [includeActivities, setIncludeActivities] = useState(true);
    const [includeStats, setIncludeStats] = useState(true);

    // Filter data based on selection
    const targetEmployees = selectedEmployeeId
        ? employees.filter((e) => e.userId === selectedEmployeeId)
        : employees;

    const targetActivities = selectedEmployeeId
        ? activities.filter((a) => a.user_id === selectedEmployeeId)
        : activities;

    // Generate PDF report
    const generatePDF = useCallback(() => {
        const doc = new jsPDF();
        let yPos = 20;

        // Title
        doc.setFontSize(20);
        doc.text("Team Performance Report", 105, yPos, { align: "center" });
        yPos += 15;

        // Date range
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Period: ${dateRange.from} to ${dateRange.to}`, 105, yPos, { align: "center" });
        yPos += 20;

        // Stats section
        if (includeStats) {
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text("Employee Statistics", 20, yPos);
            yPos += 10;

            doc.setFontSize(10);
            targetEmployees.forEach((emp) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.text(`${emp.displayName || emp.email}:`, 20, yPos);
                doc.text(`Actions: ${emp.totalActions}`, 80, yPos);
                doc.text(`Orders: ${emp.ordersCreated}`, 120, yPos);
                doc.text(`Status Changes: ${emp.statusChanges}`, 160, yPos);
                yPos += 8;
            });
            yPos += 10;
        }

        // Activities section
        if (includeActivities && targetActivities.length > 0) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.text("Recent Activities", 20, yPos);
            yPos += 10;

            doc.setFontSize(8);
            targetActivities.slice(0, 50).forEach((activity) => {
                if (yPos > 280) {
                    doc.addPage();
                    yPos = 20;
                }
                const date = new Date(activity.created_at).toLocaleString("en-US", {
                    dateStyle: "short",
                    timeStyle: "short",
                });
                doc.text(
                    `${date} - ${activity.user_email?.split("@")[0] || "User"} - ${activity.action}`,
                    20,
                    yPos
                );
                yPos += 5;
            });
        }

        // Save
        doc.save(`team-report-${new Date().toISOString().split("T")[0]}.pdf`);
    }, [targetEmployees, targetActivities, dateRange, includeStats, includeActivities]);

    // Generate Excel report
    const generateExcel = useCallback(() => {
        const workbook = XLSX.utils.book_new();

        // Stats sheet
        if (includeStats) {
            const statsData = targetEmployees.map((emp) => ({
                Name: emp.displayName || emp.email.split("@")[0],
                Email: emp.email,
                "Total Actions": emp.totalActions,
                "Orders Created": emp.ordersCreated,
                "Status Changes": emp.statusChanges,
                "Orders Printed": emp.ordersPrinted,
                "Orders Edited": emp.ordersEdited,
            }));
            const statsSheet = XLSX.utils.json_to_sheet(statsData);
            XLSX.utils.book_append_sheet(workbook, statsSheet, "Employee Stats");
        }

        // Activities sheet
        if (includeActivities) {
            const activitiesData = targetActivities.map((activity) => ({
                Date: new Date(activity.created_at).toLocaleString(),
                User: activity.user_email || "Unknown",
                Action: activity.action,
                "Entity Type": activity.entity_type || "",
                "Entity ID": activity.entity_id || "",
            }));
            const activitiesSheet = XLSX.utils.json_to_sheet(activitiesData);
            XLSX.utils.book_append_sheet(workbook, activitiesSheet, "Activities");
        }

        // Save
        XLSX.writeFile(workbook, `team-report-${new Date().toISOString().split("T")[0]}.xlsx`);
    }, [targetEmployees, targetActivities, includeStats, includeActivities]);

    // Handle export
    const handleExport = async () => {
        setStatus("exporting");
        try {
            await new Promise((resolve) => setTimeout(resolve, 500)); // Brief delay for UX
            if (format === "pdf") {
                generatePDF();
            } else {
                generateExcel();
            }
            setStatus("success");
            setTimeout(() => setStatus("idle"), 2000);
        } catch (error) {
            console.error("Export failed:", error);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 2000);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("space-y-4", className)}
        >
            {/* Header */}
            <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">{t("team.export.title")}</h3>
            </div>

            {/* Date range display */}
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t("team.export.period")}</span>
                <span className="font-medium">{dateRange.from}</span>
                <span className="text-muted-foreground">-</span>
                <span className="font-medium">{dateRange.to}</span>
            </div>

            {/* Format selection */}
            <div className="flex gap-3">
                <button
                    onClick={() => setFormat("pdf")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                        format === "pdf"
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-border"
                    )}
                >
                    <FileText
                        className={cn("w-6 h-6", format === "pdf" ? "text-primary" : "text-muted-foreground")}
                    />
                    <div className="text-right">
                        <p className="font-medium">PDF</p>
                        <p className="text-xs text-muted-foreground">{t("team.export.visualReport")}</p>
                    </div>
                </button>

                <button
                    onClick={() => setFormat("excel")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                        format === "excel"
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-border"
                    )}
                >
                    <FileSpreadsheet
                        className={cn("w-6 h-6", format === "excel" ? "text-primary" : "text-muted-foreground")}
                    />
                    <div className="text-right">
                        <p className="font-medium">Excel</p>
                        <p className="text-xs text-muted-foreground">{t("team.export.rawData")}</p>
                    </div>
                </button>
            </div>

            {/* Include options */}
            <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={includeStats}
                        onChange={(e) => setIncludeStats(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{t("team.export.includeStats")}</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={includeActivities}
                        onChange={(e) => setIncludeActivities(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{t("team.export.includeLogs")}</span>
                </label>
            </div>

            {/* Summary */}
            <div className="text-xs text-muted-foreground">
                {t("team.export.exportSummary", { emps: targetEmployees.length.toString(), acts: targetActivities.length.toString() })}
            </div>

            {/* Export button */}
            <button
                onClick={handleExport}
                disabled={status === "exporting" || (!includeStats && !includeActivities)}
                className={cn(
                    "w-full flex items-center justify-center gap-2 p-4 rounded-xl font-medium transition-all",
                    status === "success"
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-white hover:bg-primary/90",
                    status === "exporting" && "opacity-75 cursor-wait"
                )}
            >
                {status === "exporting" ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t("team.export.exporting")}
                    </>
                ) : status === "success" ? (
                    <>
                        <CheckCircle className="w-5 h-5" />
                        {t("team.export.success")}
                    </>
                ) : (
                    <>
                        <Download className="w-5 h-5" />
                        {t("team.export.title")}
                    </>
                )}
            </button>
        </motion.div>
    );
}
