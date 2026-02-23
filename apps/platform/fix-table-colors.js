const fs = require('fs');
let code = fs.readFileSync('components/orders/virtualized-order-table.tsx', 'utf8');

// Needs CheckCircle2 import
if (!code.includes('CheckCircle2')) {
    code = code.replace(/import {([^}]+)} from "lucide-react";/, 'import { $1, CheckCircle2 } from "lucide-react";');
}

// 1. Fix row background classes
code = code.replace(
    /"hover:bg-white\/80 transition-colors group border-b border-gray-100\/50 bg-white",\n\s+isSelected && "bg-blue-50\/70",\n\s+isReturn && "bg-rose-50\/40",\n\s+isPriority && !isSelected && !isReturn && "bg-amber-50\/40",\n\s+rowColor === "yellow" && "bg-yellow-50\/30",\n\s+rowColor === "green" && "bg-green-50\/30",\n\s+rowColor === "blue" && "bg-blue-50\/30",\n\s+rowColor === "pink" && "bg-pink-50\/30",\n\s+rowColor === "purple" && "bg-purple-50\/30",\n\s+isCancelled && "opacity-50 bg-gray-50\/50"/,
    `"hover:bg-[var(--hover-bg)] transition-colors group cursor-default relative bg-transparent border-b border-[var(--card-border)]",
                                        isSelected && "bg-blue-50/50 hover:bg-blue-50/80",
                                        isReturn && "bg-rose-50/30",
                                        !isReturn && isPriority && !isSelected && "bg-amber-50/30",
                                        rowColor === "yellow" && "bg-yellow-50/30",
                                        rowColor === "green" && "bg-green-50/30",
                                        rowColor === "blue" && "bg-blue-50/30",
                                        rowColor === "pink" && "bg-pink-50/30",
                                        rowColor === "purple" && "bg-purple-50/30",
                                        isCancelled && "opacity-50"`
);

// 2. Fix order ID text colors
code = code.replace(
    /"font-mono text-\[13px\] font-bold tracking-tight",\n\s+isReturn \? "text-rose-600" : "text-gray-900"/,
    `"font-mono text-sm font-bold tracking-tight",
                                            isReturn ? "text-red-600" : "text-foreground"`
);

// 3. Fix customer name & phone colors (and sizes)
code = code.replace(
    /"font-semibold text-\[13px\] text-gray-800 truncate max-w-\[150px\]"/,
    `"font-medium text-sm text-foreground truncate max-w-[150px]"`
);

// Phone 1 size & color:
code = code.replace(
    /"font-mono text-xs hover:text-emerald-600 transition-colors cursor-pointer tracking-tight",/,
    `"font-mono text-sm hover:text-emerald-600 transition-colors cursor-pointer tracking-tight",`
);

// Phone 2 size & color:
code = code.replace(
    /"font-mono text-xs hover:text-emerald-600 transition-colors tracking-tight",/,
    `"font-mono text-sm hover:text-emerald-600 transition-colors tracking-tight",`
);

// 4. Products rendering
const newProducts = `<div className="flex flex-wrap gap-1.5 min-w-[160px] max-w-[280px]">
                                            {order.items?.map((item: any, i: number) => {
                                                return (
                                                    <span
                                                        key={i}
                                                        className={cn(
                                                            "inline-flex flex-row items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border shadow-sm",
                                                            item.tag_color === 'red' && "bg-rose-50 border-rose-200 text-rose-700",
                                                            item.tag_color === 'green' && "bg-emerald-50 border-emerald-200 text-emerald-700",
                                                            item.tag_color === 'blue' && "bg-blue-50 border-blue-200 text-blue-700",
                                                            item.tag_color === 'purple' && "bg-purple-50 border-purple-200 text-purple-700",
                                                            item.tag_color === 'yellow' && "bg-amber-50 border-amber-200 text-amber-700",
                                                            item.tag_color === 'orange' && "bg-orange-50 border-orange-200 text-orange-700",
                                                            (!item.tag_color || item.tag_color === 'none') && "bg-gray-50 border-gray-200 text-gray-700"
                                                        )}
                                                        title={item.name}
                                                    >
                                                        <span className="max-w-[120px] truncate">{item.name}</span>
                                                        <span className="font-mono text-[10px] font-bold opacity-70 px-1 bg-black/5 rounded">x{item.quantity}</span>
                                                    </span>
                                                );
                                            }) || <span className="text-muted italic text-xs">لا يوجد منتجات</span>}
                                        </div>`;

code = code.replace(/<div className="flex flex-wrap gap-1">\s+\{order\.items\?\.map\(\(item: any, i: number\) => \{\s+const bgColor[^\}]+\}\)\s+\|\|\s+<span[^>]+>—<\/span>\}\s+<\/div>/m, newProducts);


// 5. Amount & Prepaid
const amountSection = `font-mono font-bold whitespace-nowrap text-sm",
                                                    isReturn ? "text-rose-600" :
                                                    !isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 ? "text-emerald-700" :
                                                    "text-emerald-600"`;

code = code.replace(
    /"font-mono font-bold whitespace-nowrap text-\[13px\]",\n\s+isReturn \? "text-rose-600" : "text-emerald-600",\n\s+!isReturn && Math\.abs\(Number\(order\.price\)\) > modePrice && modePrice > 0 && "text-amber-600",\n\s+!isReturn && Math\.abs\(Number\(order\.price\)\) < modePrice && modePrice > 0 && "text-blue-600"/,
    amountSection
);

code = code.replace(
    /<span className="px-1\.5 py-0 text-\[10px\] bg-emerald-100 text-emerald-800 rounded font-bold shadow-sm">\s+واصل\s+<\/span>/,
    `<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 uppercase tracking-wider">\n                                                    <CheckCircle2 className="w-3 h-3" /> واصل\n                                                </span>`
);


// 7. Status Column
const oldStatusBlock = `{isReturn ? (
                                            <span className="w-full px-2 py-1.5 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block shadow-[0_1px_2px_rgba(147,51,234,0.1)]">
                                                استرجاع
                                            </span>
                                        ) : (
                                            <select
                                                value={order.status}
                                                onChange={async (e) => {
                                                    await updateOrderStatus(order.id, e.target.value as Order["status"]);
                                                }}
                                                className={cn(
                                                    "w-full px-1.5 py-1.5 text-[11px] font-bold rounded-lg border-0 cursor-pointer appearance-none text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:brightness-95",
                                                    order.status === "new" && "bg-orange-100/80 text-orange-800",
                                                    order.status === "contacted" && "bg-yellow-100/80 text-yellow-800",
                                                    order.status === "confirmed" && "bg-emerald-100/80 text-emerald-800",
                                                    order.status === "in_transit" && "bg-cyan-100/80 text-cyan-800",
                                                    order.status === "delivered" && "bg-teal-100/80 text-teal-800",
                                                    order.status === "completed" && "bg-green-200/80 text-green-900 shadow-[0_0_10px_rgba(16,185,129,0.3)]",
                                                    order.status === "no_response" && "bg-gray-100/80 text-gray-700",
                                                    order.status === "rejected" && "bg-rose-100/80 text-rose-800",
                                                    order.status === "cancelled" && "bg-red-100/80 text-red-800",
                                                )}`;

const newStatusBlock = `{isReturn ? (
                                            <span className="w-full px-2 py-1.5 text-[11px] font-medium rounded-lg bg-rose-100 text-rose-700 text-center block ring-1 ring-inset ring-rose-600/20 shadow-sm">
                                                استرجاع
                                            </span>
                                        ) : (
                                            <select
                                                value={order.status}
                                                onChange={async (e) => {
                                                    await updateOrderStatus(order.id, e.target.value as Order["status"]);
                                                }}
                                                className={cn(
                                                    "w-[100%] px-1 py-1.5 text-xs font-semibold rounded-xl border-0 cursor-pointer text-center ring-1 ring-inset shadow-sm transition-all hover:brightness-95 focus:ring-2 focus:outline-none appearance-none",
                                                    order.status === "new" && "bg-blue-50 text-blue-700 ring-blue-600/20 focus:ring-blue-600/30",
                                                    order.status === "contacted" && "bg-amber-50 text-amber-700 ring-amber-600/20 focus:ring-amber-600/30",
                                                    order.status === "confirmed" && "bg-emerald-50 text-emerald-700 ring-emerald-600/20 focus:ring-emerald-600/30",
                                                    order.status === "in_transit" && "bg-cyan-50 text-cyan-700 ring-cyan-600/20 focus:ring-cyan-600/30",
                                                    order.status === "delivered" && "bg-teal-50 text-teal-700 ring-teal-600/20 focus:ring-teal-600/30",
                                                    order.status === "completed" && "bg-green-100 text-green-800 ring-green-600/20 focus:ring-green-600/30 shadow-sm",
                                                    order.status === "no_response" && "bg-gray-100 text-gray-700 ring-gray-600/20 focus:ring-gray-600/30",
                                                    order.status === "rejected" && "bg-rose-50 text-rose-700 ring-rose-600/20 focus:ring-rose-600/30",
                                                    order.status === "cancelled" && "bg-red-50 text-red-700 ring-red-600/20 focus:ring-red-600/30",
                                                    order.status === "returnPending" && "bg-purple-50 text-purple-700 ring-purple-600/20 focus:ring-purple-600/30"
                                                )}`;

code = code.replace(oldStatusBlock, newStatusBlock);

// 8. Source Column
const newSourceBlock = ` <span className={cn(
                                            "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase ring-1 ring-inset font-mono",
                                            order.source === "woo" ? "bg-purple-50 text-purple-700 ring-purple-600/20" :
                                            order.source === "salla" ? "bg-teal-50 text-teal-700 ring-teal-600/20" :
                                            "bg-gray-50 text-gray-600 ring-gray-600/20"
                                        )}>
                                            {order.source || "MANUAL"}
                                        </span>`;

code = code.replace(/<span className=\{cn\(\n\s+"inline-block px-1\.5 py-0\.5 text-\[10px\] font-bold rounded-md bg-gray-100 text-gray-600 border border-gray-200\/60 uppercase tracking-wider",\n\s+order\.source === "woo" && "bg-purple-50 text-purple-700 border-purple-200",\n\s+order\.source === "salla" && "bg-\[#bdf3f3\] text-teal-900 border-\[#9de3e3\]"\n\s+\)\}>\n\s+\{order\.source \|\| "MANUAL"\}\n\s+<\/span>/, newSourceBlock);


// 9. Color Tag (right side)
const newColorTag = `<div
                                                        className={cn(
                                                            "w-4 h-4 rounded-full border-2 transition-all hover:scale-110 cursor-pointer",
                                                            order.tag_color === "yellow" && "bg-yellow-300 border-yellow-400",
                                                            order.tag_color === "green" && "bg-green-300 border-green-400",
                                                            order.tag_color === "blue" && "bg-blue-300 border-blue-400",
                                                            order.tag_color === "pink" && "bg-pink-300 border-pink-400",
                                                            order.tag_color === "purple" && "bg-purple-300 border-purple-400",
                                                            !order.tag_color && "bg-gray-200 border-gray-300"
                                                        )}
                                                        title={order.tag_color || "No color tag"}
                                                    />`;

code = code.replace(/\{order\.tag_color \? \(\n\s+<div\n\s+className="w-4 h-4 rounded-full shadow-sm border border-black\/5"\n\s+style=\{\{ backgroundColor: order\.tag_color \}\}\n\s+title=\{order\.tag_color\}\n\s+\/>\n\s+\) : \(\n\s+<span className="text-gray-200">—<\/span>\n\s+\)\}/, newColorTag);

fs.writeFileSync('components/orders/virtualized-order-table.tsx', code);
console.log('Restored original styling attributes to virtualized table');
