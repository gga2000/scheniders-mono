import { CleanedRecord } from "@/hooks/use-data-importer";
import { Download, RefreshCw } from "lucide-react";
import * as xlsx from 'xlsx';

interface ExportStepProps {
    data: CleanedRecord[];
    onReset: () => void;
}

export function ExportStep({ data, onReset }: ExportStepProps) {

    const handleExport = () => {
        // Map our cleaned internal records to a flat Excel-friendly format
        // We ensure this is pristine and matches the Supabase Orders/Customers expectation
        const exportData = data.map(record => ({
            "Order ID": record.order_id,
            "Customer Name": record.customer_name,
            "Phone": record.phone,
            "Secondary Phone": record.secondary_phone,
            "Governorate Code": record.governorate_code,
            "City": record.city,
            "Address Details": record.address_details,
            // Include a clean/dirty flag for their own records if they want
            "Needs Review": record.needs_review ? "Yes" : "No",
            "Review Reasons": record.review_reasons.join(", ")
        }));

        const worksheet = xlsx.utils.json_to_sheet(exportData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 15 }, // Order ID
            { wch: 25 }, // Name
            { wch: 15 }, // Phone
            { wch: 15 }, // Secondary Phone
            { wch: 10 }, // Gov Code
            { wch: 20 }, // City
            { wch: 40 }, // Address Details
            { wch: 12 }, // Needs Review
            { wch: 30 }, // Review Reasons
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Cleaned Customers");

        // Generate and download
        xlsx.writeFile(workbook, `Cleaned_Customers_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const readyCount = data.filter(d => !d.needs_review).length;

    return (
        <div className="max-w-2xl mx-auto text-center space-y-8 py-12">
            <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <Download className="w-10 h-10" />
            </div>

            <h2 className="text-3xl font-black">Data Ready for Export</h2>
            <p className="text-lg text-slate-500 max-w-lg mx-auto leading-relaxed">
                You have <strong>{data.length}</strong> records processed. <br />
                <span className="text-green-600 font-medium">{readyCount} are perfectly clean</span> and ready for your production database.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                <button
                    onClick={handleExport}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold shadow-xl shadow-blue-500/20 transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"
                >
                    <Download className="w-5 h-5" />
                    Download Clean Excel File
                </button>

                <button
                    onClick={onReset}
                    className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-8 py-4 rounded-xl font-bold transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"
                >
                    <RefreshCw className="w-5 h-5" />
                    Start Over
                </button>
            </div>

            <p className="text-sm text-slate-400 mt-8 max-w-md mx-auto">
                No data has been saved to your live database. You can safely review the exported file and use your standard importer once you are satisfied.
            </p>
        </div>
    );
}
