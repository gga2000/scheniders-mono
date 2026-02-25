import { UploadCloud } from "lucide-react";

interface FileUploadStepProps {
    onPrimaryUpload: (file: File) => void;
    onBackupUpload: (file: File) => void;
    hasPrimary: boolean;
    hasBackup: boolean;
    onNext: () => void;
}

export function FileUploadStep({
    onPrimaryUpload,
    onBackupUpload,
    hasPrimary,
    hasBackup,
    onNext,
}: FileUploadStepProps) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isPrimary: boolean) => {
        const file = e.target.files?.[0];
        if (file) {
            if (isPrimary) onPrimaryUpload(file);
            else onBackupUpload(file);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Upload */}
                <div className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-colors ${hasPrimary ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-slate-300 dark:border-slate-700 hover:border-blue-500"}`}>
                    <UploadCloud className={`w-12 h-12 mb-4 ${hasPrimary ? "text-green-500" : "text-slate-400"}`} />
                    <h3 className="text-lg font-semibold mb-2">1. Main Customer Data</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Upload your massive Excel or CSV containing the dirty customer data.
                    </p>
                    <label className="relative cursor-pointer bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                        <span>{hasPrimary ? "Change File" : "Select File"}</span>
                        <input
                            type="file"
                            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                            className="hidden"
                            onChange={(e) => handleFileChange(e, true)}
                        />
                    </label>
                    {hasPrimary && <p className="mt-4 text-sm text-green-600 font-medium">✓ File Loaded</p>}
                </div>

                {/* Backup Upload */}
                <div className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-colors ${hasBackup ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-slate-300 dark:border-slate-700 hover:border-blue-500"}`}>
                    <UploadCloud className={`w-12 h-12 mb-4 ${hasBackup ? "text-green-500" : "text-slate-400"}`} />
                    <h3 className="text-lg font-semibold mb-2">2. Backup Data (Optional)</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Upload the backup sheet to merge missing Order IDs.
                    </p>
                    <label className="relative cursor-pointer bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                        <span>{hasBackup ? "Change File" : "Select File"}</span>
                        <input
                            type="file"
                            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                            className="hidden"
                            onChange={(e) => handleFileChange(e, false)}
                        />
                    </label>
                    {hasBackup && <p className="mt-4 text-sm text-green-600 font-medium">✓ Backup Loaded</p>}
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    onClick={onNext}
                    disabled={!hasPrimary}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all"
                >
                    Continue to Mapping →
                </button>
            </div>
        </div>
    );
}
