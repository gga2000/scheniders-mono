const fs = require('fs');
let code = fs.readFileSync('components/orders/virtualized-order-table.tsx', 'utf8');

const startIdx = code.indexOf('return (\n                                <div\n                                    key={virtualRow.key}');
const endIdx = code.indexOf('</div>\n                            );\n                        })}\n                    </div>');

if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find start or end index");
    process.exit(1);
}

const replacement = `return (
                                <div
                                    key={virtualRow.key}
                                    data-index={virtualRow.index}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%',
                                        height: \`\${virtualRow.size}px\`,
                                        transform: \`translateY(\${virtualRow.start}px)\`
                                    }}
                                    role="row"
                                    className={cn(
                                        "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]",
                                        "items-center",
                                        "hover:bg-[var(--background)] transition-all group relative border-b border-[var(--card-border)]",
                                        isSelected && "bg-blue-50/70",
                                        isReturn && "bg-red-50/40",
                                        isPriority && !isSelected && !isReturn && "bg-amber-50/60",
                                        rowColor === "yellow" && "bg-yellow-50/60",
                                        rowColor === "green" && "bg-green-50/60",
                                        rowColor === "blue" && "bg-blue-50/60",
                                        rowColor === "pink" && "bg-pink-50/60",
                                        rowColor === "purple" && "bg-purple-50/60",
                                        isCancelled && "opacity-60 bg-gray-50"
                                    )}
                                >
                                    {/* Row Number */}
                                    <div role="cell" className={cn(
                                        "px-2 py-2.5 h-full flex items-center justify-center text-xs font-mono text-muted border-r border-gray-100 bg-[var(--background)]",
                                        isCancelled && "bg-gray-50"
                                    )}>
                                        <div className="flex items-center justify-center gap-1 group/pin">
                                            <span>{order.sequence_number || order.displayIndex || virtualRow.index + 1}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePin(order.id);
                                                }}
                                                className={cn(
                                                    "opacity-0 group-hover/pin:opacity-100 transition-opacity",
                                                    order.is_pinned && "opacity-100"
                                                )}
                                            >
                                                <Pin
                                                    className={cn(
                                                        "w-3 h-3 hover:scale-110 transition-transform",
                                                        order.is_pinned ? "text-primary fill-current" : "text-muted"
                                                    )}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Checkbox */}
                                    <div role="cell" className={cn(
                                        "px-2 py-2.5 h-full flex items-center justify-center border-r border-gray-100",
                                        isCancelled && "bg-gray-50"
                                    )}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleOrderSelection(order.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 rounded border-gray-300"
                                        />
                                    </div>

                                    {/* Order ID */}
                                    <div role="cell"
                                        className={cn(
                                            "px-2 py-2.5 h-full flex items-center cursor-pointer border-r border-gray-100",
                                            isCancelled && "bg-gray-50"
                                        )}
                                        onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                    >
                                        <span className={cn(
                                            "font-mono text-sm font-bold",
                                            isReturn ? "text-red-600" : "text-foreground"
                                        )}>
                                            #{(() => {
                                                const lfMatch = order.order_id.match(/LF-(\\d+)-\\d+$/);
                                                if (lfMatch) return lfMatch[1];
                                                const dlvMatch = order.order_id.match(/DLV-(\\d+)$/);
                                                if (dlvMatch) return dlvMatch[1];
                                                return order.order_id.slice(-6);
                                            })()}
                                        </span>
                                    </div>

                                    {/* Customer */}
                                    <div role="cell"
                                        className="px-2 py-2.5 cursor-pointer"
                                        onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-foreground">
                                                {order.customer_name}
                                            </span>
                                            {getRiskLevel(order.phone) && (getRiskLevel(order.phone) === 'high' || getRiskLevel(order.phone) === 'blocked' || getRiskLevel(order.phone) === 'medium') && (
                                                <RiskBadge level={getRiskLevel(order.phone) as "high" | "low" | "medium" | "blocked"} showLabel={false} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone 1 */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="relative inline-flex items-center gap-1 group/phone">
                                            <span
                                                className={cn(
                                                    "font-mono text-xs hover:text-green-600 transition-colors cursor-pointer",
                                                    !validatePhoneDetailed(order.phone).isValid ? "text-red-600 font-bold" : "text-foreground",
                                                    isDuplicate && "text-amber-600 font-bold"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(\`https://wa.me/964\${order.phone.replace(/^0/, "")}?text=\${encodeURIComponent(\`مرحباً \${order.customer_name}\`)}\`, "_blank");
                                                }}
                                            >
                                                {order.phone.replace(/^\\+964/, "0").replace(/^964/, "0")}
                                            </span>
                                            {isDuplicate && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDuplicateOrder(order);
                                                        setShowDuplicateModal(true);
                                                    }}
                                                    className="p-1 rounded hover:bg-amber-100 transition-colors"
                                                    title="View duplicate orders"
                                                >
                                                    <CopyPlus className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600" />
                                                </button>
                                            )}
                                            {!validatePhoneDetailed(order.phone).isValid && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                            )}
                                            <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone:opacity-100 transition-opacity" title="WhatsApp" />
                                        </div>
                                    </div>

                                    {/* Phone 2 */}
                                    <div role="cell" className="px-2 py-2.5">
                                        {order.secondary_phone ? (
                                            <div
                                                className="relative inline-flex items-center gap-1 cursor-pointer group/phone2"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(\`https://wa.me/964\${order.secondary_phone.replace(/^0/, "")}?text=\${encodeURIComponent(\`مرحباً \${order.customer_name}\`)}\`, "_blank");
                                                }}
                                            >
                                                <span className={cn(
                                                    "font-mono text-xs hover:text-green-600 transition-colors",
                                                    !validatePhoneDetailed(order.secondary_phone).isValid ? "text-red-600 font-bold" : "text-muted"
                                                )}>
                                                    {order.secondary_phone.replace(/^\\+964/, "0").replace(/^964/, "0")}
                                                </span>
                                                {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                                )}
                                                <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone2:opacity-100 transition-opacity" title="WhatsApp" />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted">—</span>
                                        )}
                                    </div>

                                    {/* City */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <span className="text-xs text-muted">{order.city || "—"}</span>
                                    </div>

                                    {/* Address */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <span className="text-xs text-muted truncate block max-w-[120px]" title={order.address_details || ""}>
                                            {order.address_details ? order.address_details.replace(order.city || "", "").replace(/^[\\s,-]+/, "").trim() || "—" : "—"}
                                        </span>
                                    </div>

                                    {/* Products */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {order.items?.map((item, i) => {
                                                const bgColor = item.tag_color ? \`\${item.tag_color}20\` : '#f3f4f6';
                                                const textColor = item.tag_color || '#374151';
                                                return (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md"
                                                        style={{
                                                            backgroundColor: bgColor,
                                                            color: textColor,
                                                            border: \`1px solid \${item.tag_color || '#e5e7eb'}\`
                                                        }}
                                                        title={item.name}
                                                    >
                                                        {item.name} <span style={{ opacity: 0.7 }}>×{item.quantity}</span>
                                                    </span>
                                                );
                                            }) || <span className="text-xs text-muted">—</span>}
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex flex-col items-start gap-0.5">
                                            <div className="flex items-center gap-1">
                                                <span className={cn(
                                                    "font-mono font-bold whitespace-nowrap",
                                                    isReturn ? "text-xs text-red-600" : "text-sm text-emerald-600",
                                                    !isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && "text-amber-600",
                                                    !isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && "text-blue-600"
                                                )}>
                                                    {isReturn && "-"}{Math.abs(Number(order.price)).toLocaleString()} IQD
                                                </span>
                                                {!isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && (
                                                    <TrendingUp className="w-3 h-3 text-amber-500" />
                                                )}
                                                {!isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && (
                                                    <TrendingDown className="w-3 h-3 text-blue-500" />
                                                )}
                                            </div>
                                            {(order.payment_status === "paid" || order.payment_status === "prepaid") && (
                                                <span className="px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 rounded-md font-bold">
                                                    واصل
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div role="cell" className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                        {isReturn ? (
                                            <span className="w-full px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block">
                                                استرجاع
                                            </span>
                                        ) : (
                                            <select
                                                value={order.status}
                                                onChange={async (e) => {
                                                    await updateOrderStatus(order.id, e.target.value as Order["status"]);
                                                }}
                                                className={cn(
                                                    "w-full px-2 py-1 text-[11px] font-bold rounded-lg border-0 cursor-pointer appearance-none text-center",
                                                    order.status === "new" && "bg-orange-100 text-orange-700",
                                                    order.status === "contacted" && "bg-yellow-100 text-yellow-700",
                                                    order.status === "confirmed" && "bg-green-100 text-green-700",
                                                    order.status === "in_transit" && "bg-blue-100 text-blue-700",
                                                    order.status === "delivered" && "bg-teal-100 text-teal-700",
                                                    order.status === "completed" && "bg-emerald-100 text-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.4)]",
                                                    order.status === "no_response" && "bg-gray-100 text-gray-600",
                                                    order.status === "rejected" && "bg-rose-100 text-rose-700",
                                                    order.status === "cancelled" && "bg-red-100 text-red-700",
                                                    order.status === "returnPending" && "bg-purple-100 text-purple-700"
                                                )}
                                            >
                                                <option value="new">جديد</option>
                                                <option value="contacted">تم الاتصال</option>
                                                <option value="confirmed">مؤكد</option>
                                                <option value="in_transit">قيد التوصيل</option>
                                                <option value="delivered">تم التسليم</option>
                                                <option value="completed">مكتمل</option>
                                                <option value="no_response">لم يرد</option>
                                                <option value="rejected">مرفوض</option>
                                                <option value="cancelled">ملغي</option>
                                            </select>
                                        )}
                                    </div>

                                    {/* Source */}
                                    <div role="cell" className="px-2 py-2 text-center h-full flex items-center justify-center">
                                        <span className={cn(
                                            "px-1.5 py-0.5 text-[9px] font-bold rounded",
                                            order.source === "lightfunnels" && "bg-purple-100 text-purple-700",
                                            order.source === "delivery_import" && "bg-blue-100 text-blue-700",
                                            order.source === "whatsapp" && "bg-green-100 text-green-700",
                                            order.source === "shop" && "bg-amber-100 text-amber-700",
                                            (!order.source || order.source === "woo" || order.source === "salla" || order.source === "manual") && "bg-gray-100 text-gray-500",
                                        )}>
                                            {order.source === "lightfunnels" ? "LF" :
                                                order.source === "delivery_import" ? "DLV" :
                                                    order.source === "whatsapp" ? "WA" :
                                                        order.source === "shop" ? "محل" :
                                                            order.source === "woo" ? "WOO" :
                                                                order.source === "salla" ? "SALLA" :
                                                                    (order.source || "—")}
                                        </span>
                                    </div>

                                    {/* Date */}
                                    <div role="cell" className="px-2 py-2">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-gray-700">
                                                {new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Color Tag */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex justify-center">
                                            <div
                                                className={cn(
                                                    "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                                                    order.tag_color === "yellow" && "bg-yellow-300 border-yellow-400",
                                                    order.tag_color === "green" && "bg-green-300 border-green-400",
                                                    order.tag_color === "blue" && "bg-blue-300 border-blue-400",
                                                    order.tag_color === "pink" && "bg-pink-300 border-pink-400",
                                                    order.tag_color === "purple" && "bg-purple-300 border-purple-400",
                                                    !order.tag_color && "bg-gray-200 border-gray-300"
                                                )}
                                                title={order.tag_color || "No color tag"}
                                            />
                                        </div>
                                    </div>
`;

code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
fs.writeFileSync('components/orders/virtualized-order-table.tsx', code);
console.log("Replaced row render HTML.");
