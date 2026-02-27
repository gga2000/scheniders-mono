import { useProductsCrud } from "@/hooks/use-products-crud";
import { formatIQD } from "@/lib/utils";
import { Box, Plus, Search, Edit2 } from "lucide-react";
import { useState } from "react";
import { StockIndicator } from "@/components/products/stock-indicator";
import { getStockStatus, Product } from "@/lib/supabase";

interface SuppliesTabProps {
    onEdit?: (product: Product) => void;
}

export function SuppliesTab({ onEdit }: SuppliesTabProps) {
    const { products, loading } = useProductsCrud();
    const [searchQuery, setSearchQuery] = useState("");

    // Filter just supplies
    const supplies = products.filter(p => p.is_supply && !p.is_archived);

    const filteredSupplies = supplies.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return <div className="py-12 text-center text-muted">Loading supplies...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Box className="w-6 h-6 text-teal-500" />
                        Internal Supplies
                    </h2>
                    <p className="text-muted text-sm mt-1">Packaging, vials, and collateral deducted automatically via BOM.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <input
                            type="text"
                            placeholder="Search supplies..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                    </div>
                </div>
            </div>

            {filteredSupplies.length === 0 ? (
                <div className="pastel-card p-12 text-center">
                    <Box className="h-12 w-12 text-muted mx-auto mb-4" />
                    <p className="text-lg font-medium">No supplies found</p>
                    <p className="text-sm text-muted">Add packaging materials as products with "is_supply" checked.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredSupplies.map(supply => (
                        <div key={supply.id} className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-foreground">{supply.name}</h3>
                                    <p className="text-xs text-muted mt-1">{supply.sku || 'No SKU'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {onEdit && (
                                        <button
                                            onClick={() => onEdit(supply)}
                                            className="p-2 rounded-lg bg-[var(--background)] hover:bg-[var(--card-border)] text-muted hover:text-foreground transition-colors"
                                            title="Edit Supply"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    <div className="w-10 h-10 rounded-lg overflow-hidden flex flex-shrink-0 flex-col items-center justify-center bg-[var(--background)]">
                                        {supply.image_url ? (
                                            <img src={supply.image_url} alt={supply.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Box className="w-5 h-5 text-teal-600" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-end mt-4 pt-4 border-t border-[var(--card-border)]">
                                <div>
                                    <p className="text-xs text-muted mb-1">Stock Level</p>
                                    <StockIndicator
                                        status={getStockStatus(supply)}
                                        quantity={supply.stock_quantity}
                                        size="sm"
                                    />
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted mb-1">Unit Cost</p>
                                    <p className="font-medium">{formatIQD(supply.cost || 0)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
