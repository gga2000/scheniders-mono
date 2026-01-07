"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { generateFullSnapshot, restoreFromSnapshot, downloadSnapshot } from "@/lib/backup-utils";
import { AlertTriangle, Upload, CheckCircle, Database, Download, FileSpreadsheet, Loader2 } from "lucide-react";

export function DataSettings() {
    const [exporting, setExporting] = useState<string | null>(null);

    const downloadCSV = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const convertToCSV = (objArray: any[]) => {
        if (!objArray || objArray.length === 0) return "";
        const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
        let str = '';

        // Header
        const headers = Object.keys(array[0]);
        str += headers.join(',') + '\r\n';

        // Lines
        for (let i = 0; i < array.length; i++) {
            let line = '';
            for (const index in array[i]) {
                if (line != '') line += ','

                let val = array[i][index];
                if (typeof val === 'object') {
                    val = JSON.stringify(val).replace(/"/g, '""'); // Escape double quotes
                    val = `"${val}"`;
                } else if (typeof val === 'string') {
                    val = val.replace(/"/g, '""');
                    val = `"${val}"`;
                }

                line += val;
            }
            str += line + '\r\n';
        }
        return str;
    };

    const handleExportOrders = async () => {
        setExporting("orders");
        try {
            const { data, error } = await supabase.from('orders').select('*');
            if (error) throw error;
            const csv = convertToCSV(data);
            downloadCSV(csv, `orders_backup_${new Date().toISOString().split('T')[0]}.csv`);
        } catch (err) {
            console.error("Export failed", err);
            alert("Failed to export orders");
        } finally {
            setExporting(null);
        }
    };

    const handleExportCustomers = async () => {
        setExporting("customers");
        try {
            const { data: notes } = await supabase.from('customer_notes').select('*');
            if (notes) {
                const csv = convertToCSV(notes);
                downloadCSV(csv, `customer_notes_${new Date().toISOString().split('T')[0]}.csv`);
            }
        } catch (err) {
            console.error("Export failed", err);
        } finally {
            setExporting(null);
        }
    };

    // Snapshot Logic
    const [isSnapshotting, setIsSnapshotting] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateSnapshot = async () => {
        setIsSnapshotting(true);
        try {
            const snapshot = await generateFullSnapshot();
            downloadSnapshot(snapshot);
            alert("Snapshot created successfully!");
        } catch (error) {
            console.error("Snapshot error:", error);
            alert("Failed to create snapshot.");
        } finally {
            setIsSnapshotting(false);
        }
    };

    const handleRestoreClick = () => {
        const confirmed = confirm("WARNING: restoring a snapshot will OVERWRITE existing data with the same IDs. This action cannot be undone. Are you surely you want to proceed?");
        if (confirmed) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsRestoring(true);
        try {
            const text = await file.text();
            const snapshot = JSON.parse(text);

            const result = await restoreFromSnapshot(snapshot);
            if (result.success) {
                alert("Restore complete! Please refresh the page.");
                window.location.reload();
            } else {
                alert(`Restore failed: ${result.error}`);
            }
        } catch (error) {
            console.error("Restore error:", error);
            alert("Invalid snapshot file.");
        } finally {
            setIsRestoring(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Data Management</h2>
                <p className="text-muted">Backup your data and manage exports.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                            <Database className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Data Export</h3>
                    </div>
                    <p className="text-sm text-muted mb-6">Download your data in CSV format for backup or external analysis.</p>

                    <div className="space-y-3">
                        <button
                            onClick={handleExportOrders}
                            disabled={!!exporting}
                            className="w-full flex items-center justify-start gap-2 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:bg-[var(--card-bg-hover)] transition-all disabled:opacity-50"
                        >
                            <FileSpreadsheet className="h-4 w-4 text-green-600" />
                            {exporting === 'orders' ? 'Exporting...' : 'Export All Orders (CSV)'}
                        </button>
                        <button
                            onClick={handleExportCustomers}
                            disabled={!!exporting}
                            className="w-full flex items-center justify-start gap-2 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:bg-[var(--card-bg-hover)] transition-all disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            {exporting === 'customers' ? 'Exporting...' : 'Export Customer Notes (CSV)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Snapshot Section */}
            <div className="grid gap-6 md:grid-cols-2 mt-6">
                <div className="pastel-card p-6 border-blue-100 bg-blue-50/50">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Upload className="h-4 w-4 text-blue-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Database Snapshots</h3>
                    </div>
                    <p className="text-sm text-muted mb-6">Create a full JSON point-in-time backup of your entire database.</p>

                    <div className="space-y-3">
                        <button
                            onClick={handleCreateSnapshot}
                            disabled={isSnapshotting}
                            className="w-full flex items-center justify-start gap-2 px-4 py-3 rounded-xl border border-blue-200 bg-white text-blue-900 hover:bg-blue-50 transition-all disabled:opacity-50 font-medium"
                        >
                            {isSnapshotting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                            {isSnapshotting ? 'Generating Snapshot...' : 'Create Full Snapshot (JSON)'}
                        </button>
                    </div>
                </div>

                <div className="pastel-card p-6 border-red-100 bg-red-50/50">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-red-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-red-900">Danger Zone</h3>
                    </div>
                    <p className="text-sm text-red-800 mb-6">Restore data from a previous snapshot. Existing records will be updated.</p>

                    <div className="space-y-3">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".json"
                            className="hidden"
                        />
                        <button
                            onClick={handleRestoreClick}
                            disabled={isRestoring}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-50 font-bold shadow-sm"
                        >
                            {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {isRestoring ? 'Restoring Data...' : 'Restore from Snapshot'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

