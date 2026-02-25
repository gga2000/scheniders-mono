import { ColumnMapping } from "@/hooks/use-data-importer";

interface ColumnMappingStepProps {
    mapping: Partial<ColumnMapping>;
    setMapping: (m: Partial<ColumnMapping>) => void;
    backupMapping: { matchKey: string, targetKey: string };
    setBackupMapping: (m: { matchKey: string, targetKey: string }) => void;
    headers: string[];
    backupHeaders: string[];
    onBack: () => void;
    onNext: () => void;
}

export function ColumnMappingStep({
    mapping,
    setMapping,
    backupMapping,
    setBackupMapping,
    headers,
    backupHeaders,
    onBack,
    onNext
}: ColumnMappingStepProps) {

    const updateMap = (key: keyof ColumnMapping, value: string) => {
        setMapping({ ...mapping, [key]: value });
    };

    const isReady = !!(mapping.customerName && mapping.phone && mapping.address);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-xl font-bold mb-4">Map Primary Fields</h3>
                <p className="text-slate-500 mb-6 font-medium">Select which columns from your Excel file match our required data fields.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FieldSelect label="Customer Name *" value={mapping.customerName || ''} onChange={(v) => updateMap('customerName', v)} options={headers} />
                    <FieldSelect label="Phone Number *" value={mapping.phone || ''} onChange={(v) => updateMap('phone', v)} options={headers} />
                    <FieldSelect label="Raw Address Text *" value={mapping.address || ''} onChange={(v) => updateMap('address', v)} options={headers} />
                    <FieldSelect label="Order ID (Optional)" value={mapping.orderId || ''} onChange={(v) => updateMap('orderId', v)} options={headers} />
                </div>
            </div>

            {backupHeaders.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xl font-bold mb-4">Backup Merge Settings</h3>
                    <p className="text-slate-500 mb-6 font-medium">How should we match the backup data to the primary data?</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FieldSelect
                            label="Backup Match Column (e.g. Phone)"
                            value={backupMapping.matchKey}
                            onChange={(v) => setBackupMapping({ ...backupMapping, matchKey: v })}
                            options={backupHeaders}
                        />
                        <FieldSelect
                            label="Backup Target Column (e.g. missing Order ID)"
                            value={backupMapping.targetKey}
                            onChange={(v) => setBackupMapping({ ...backupMapping, targetKey: v })}
                            options={backupHeaders}
                        />
                    </div>
                </div>
            )}

            <div className="flex justify-between pt-4">
                <button
                    onClick={onBack}
                    className="px-6 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                    ← Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!isReady}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-medium shadow-lg transition-all"
                >
                    Process & Clean Data
                </button>
            </div>
        </div>
    );
}

function FieldSelect({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: string[] }) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{label}</label>
            <select
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">-- Select a column --</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </div>
    );
}
