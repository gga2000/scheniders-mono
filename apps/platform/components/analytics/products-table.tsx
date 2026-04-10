"use client";

import { Card } from "@scheniders/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@scheniders/ui/table";
import { formatIQD } from "@/lib/utils";

interface ProductsTableProps {
    data: Array<{ name: string; quantity: number; revenue: number }>;
}

export function ProductsTable({ data }: ProductsTableProps) {
    return (
        <Card className="p-6">
            <h3 className="text-xl font-bold mb-6">أفضل المنتجات</h3>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>الكمية</TableHead>
                            <TableHead>الإيرادات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length > 0 ? (
                            data.map((product, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{product.name}</TableCell>
                                    <TableCell className="font-mono">{product.quantity}×</TableCell>
                                    <TableCell className="font-mono text-financial font-semibold">
                                        {formatIQD(product.revenue)}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                                    لا توجد منتجات
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
