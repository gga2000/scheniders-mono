import { CleanedRecord } from "@/hooks/use-data-importer";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ReviewStepProps {
    data: CleanedRecord[];
    onBack: () => void;
    onNext: () => void;
    onUpdateRecord: (id: string, updates: Partial<CleanedRecord>) => void;
}

export function ReviewStep({ data, onBack, onNext, onUpdateRecord }: ReviewStepProps) {
    const readyCount = data.filter(d => !d.needs_review).length;
    const reviewCount = data.length - readyCount;

    return (
        <div className="space-y-6">
            <div className="flex grid-cols-3 gap-4 mb-6">
                <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Total Records</p>
                        <p className="text-2xl font-black">{data.length}</p>
                    </div>
                </div>
                <div className="flex-1 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-sm font-medium">Ready to Export</p>
                        <p className="text-2xl font-black">{readyCount}</p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 opacity-50" />
                </div>
                <div className="flex-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-sm font-medium">Needs Attention</p>
                        <p className="text-2xl font-black">{reviewCount}</p>
                    </div>
                    <AlertCircle className="w-8 h-8 opacity-50" />
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Name</th>
                                <th className="px-4 py-3 font-semibold">Clean Phone</th>
                                <th className="px-4 py-3 font-semibold">Gov Code</th>
                                <th className="px-4 py-3 font-semibold">City</th>
                                <th className="px-4 py-3 font-semibold">Street Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* We just show the first 100 to not freeze the browser in this simple view, 
                                but export will contain all. For a true massive dataset, we'd use TanStack Virtual */}
                            {data.slice(0, 100).map((row) => (
                                <tr key={row._id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20">
                                    <td className="px-4 py-3">
                                        {row.needs_review ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full">
                                                <AlertCircle className="w-3 h-3" /> Review
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" /> Valid
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-medium">{row.customer_name}</td>
                                    <td className="px-4 py-3">
                                        <input
                                            value={row.phone}
                                            onChange={(e) => onUpdateRecord(row._id, { phone: e.target.value })}
                                            className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 px-2 py-1 rounded w-full outline-none focus:border-blue-500"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            value={row.governorate_code}
                                            onChange={(e) => onUpdateRecord(row._id, { governorate_code: e.target.value })}
                                            className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 px-2 py-1 rounded w-16 outline-none focus:border-blue-500"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            value={row.city}
                                            onChange={(e) => onUpdateRecord(row._id, { city: e.target.value })}
                                            className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 px-2 py-1 rounded w-full outline-none focus:border-blue-500"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            value={row.address_details}
                                            onChange={(e) => onUpdateRecord(row._id, { address_details: e.target.value })}
                                            className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 px-2 py-1 rounded w-full outline-none focus:border-blue-500"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {data.length > 100 && (
                        <div className="p-4 text-center text-sm font-medium text-slate-500 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                            Showing first 100 records in preview. All {data.length} will be exported.
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-between pt-4">
                <button
                    onClick={onBack}
                    className="px-6 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                    ← Back
                </button>
                <button
                    onClick={onNext}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg shadow-green-500/20 transition-all flex items-center gap-2"
                >
                    Continue to Export
                </button>
            </div>
        </div>
    );
}
