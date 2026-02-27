import { useInventoryQC } from "@/hooks/use-inventory-qc";
import { formatIQD, formatDate } from "@/lib/utils";
import { ShieldAlert, CheckCircle, XCircle, Search, RefreshCw, PackageX } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

export function QCQuarantineTab() {
    const { qcItems, isLoading, error, resolveItem } = useInventoryQC();
    const [searchQuery, setSearchQuery] = useState("");

    const handleResolve = async (id: string, resolution: 'restocked' | 'written_off', productId: string, quantity: number) => {
        if (confirm(`Are you sure you want to mark this as ${resolution}?`)) {
            await resolveItem(id, resolution, productId, quantity);
        }
    };

    const pendingItems = qcItems.filter(item => item.status === 'pending_inspection');

    // Filter by search
    const filteredItems = pendingItems.filter(item => {
        const query = searchQuery.toLowerCase();
        return item.product?.name.toLowerCase().includes(query) ||
            item.reason.toLowerCase().includes(query) ||
            item.order?.order_id?.toLowerCase().includes(query);
    });

    if (isLoading) {
        return (
            <div className="py-12 flex justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-muted" />
            </div>
        );
    }

    if (error) {
        return <div className="text-red-500 py-4">Error loading QC items.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-amber-500" />
                        QC Quarantine
                    </h2>
                    <p className="text-muted text-sm mt-1">Items returned and awaiting quality inspection.</p>
                </div>

                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                        type="text"
                        placeholder="Search QC items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                </div>
            </div>

            {filteredItems.length === 0 ? (
                <div className="pastel-card p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm text-muted">There are no items awaiting quality control inspection.</p>
                </div>
            ) : (
                <div className="bg-[var(--card-bg)] shadow-[var(--card-shadow)] rounded-2xl overflow-hidden border border-[var(--card-border)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                                    <th className="p-4 font-semibold text-sm text-foreground">Product</th>
                                    <th className="p-4 font-semibold text-sm text-foreground">Order Ref</th>
                                    <th className="p-4 font-semibold text-sm text-foreground">Quantity</th>
                                    <th className="p-4 font-semibold text-sm text-foreground">Reason</th>
                                    <th className="p-4 font-semibold text-sm text-foreground">Date Entered</th>
                                    <th className="p-4 font-semibold text-sm text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--card-border)]">
                                {filteredItems.map(item => (
                                    <motion.tr
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        key={item.id}
                                        className="hover:bg-[var(--background)]/30 transition-colors"
                                    >
                                        <td className="p-4 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center">
                                                {item.product?.image_url ? (
                                                    <img src={item.product.image_url} alt={item.product?.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <PackageX className="w-5 h-5 text-muted" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground">{item.product?.name || "Unknown Product"}</p>
                                                <p className="text-xs text-muted">Value: {formatIQD(item.product?.cost || 0)}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm font-medium text-[var(--accent)]">
                                            #{item.order?.order_id || "N/A"}
                                        </td>
                                        <td className="p-4">
                                            <span className="font-bold">{item.quantity}</span> units
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2 py-1 rounded bg-rose-500/10 text-rose-500 text-xs font-medium">
                                                {item.reason}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-muted">
                                            {formatDate(item.created_at)}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleResolve(item.id, 'restocked', item.product_id, item.quantity)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Restock
                                                </button>
                                                <button
                                                    onClick={() => handleResolve(item.id, 'written_off', item.product_id, item.quantity)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    Write-off
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
