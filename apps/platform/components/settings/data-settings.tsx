"use client";

import { Database, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

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
        </div>
    );
}

