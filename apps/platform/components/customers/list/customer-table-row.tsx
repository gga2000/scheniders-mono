"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  MessageCircle, Copy, ChevronRight, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerAvatar } from "../shared/customer-avatar";
import { CustomerStatusBadge } from "../shared/customer-status-badge";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface CustomerTableRowProps {
  customer: PaginatedCustomer;
  isSelected: boolean;
  onSelect: (phone: string) => void;
  index: number;
}

function formatIQD(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}م`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}ك`;
  return amount.toLocaleString("ar-IQ");
}

function relativeDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
  } catch {
    return dateStr;
  }
}

export function CustomerTableRow({
  customer,
  isSelected,
  onSelect,
  index,
}: CustomerTableRowProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const status = customer.is_blacklisted
    ? "blacklisted"
    : customer.calculated_status;

  function handleCopyPhone(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(customer.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation();
    const cleaned = customer.phone.replace(/\D/g, "");
    const num = cleaned.startsWith("964") ? cleaned : `964${cleaned.replace(/^0/, "")}`;
    window.open(`https://wa.me/${num}`, "_blank");
  }

  function handleRowClick() {
    router.push(`/customers/${encodeURIComponent(customer.phone)}`);
  }

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
      onClick={handleRowClick}
      className={cn(
        "group relative cursor-pointer border-b border-(--card-border) transition-colors duration-100",
        isSelected ? "bg-(--pastel-blue)/20" : "hover:bg-background",
        customer.is_blacklisted && "opacity-60"
      )}
    >
      {/* Selection indicator bar */}
      <td className="w-1 p-0">
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              exit={{ scaleY: 0 }}
              className="h-full w-0.5 bg-(--pastel-blue) rounded-r-full"
            />
          )}
        </AnimatePresence>
      </td>

      {/* Checkbox */}
      <td className="w-10 px-3 py-3.5" onClick={(e) => { e.stopPropagation(); onSelect(customer.phone); }}>
        <div
          className={cn(
            "h-4 w-4 rounded border-2 flex items-center justify-center transition-all duration-150 cursor-pointer",
            isSelected
              ? "border-blue-500 bg-blue-500"
              : "border-(--card-border) group-hover:border-(--border-hover)"
          )}
        >
          {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </div>
      </td>

      {/* Customer info */}
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-3">
          <CustomerAvatar name={customer.name} phone={customer.phone} status={status} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate max-w-[160px]">
              {customer.name}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-muted font-mono">{customer.phone}</span>
              <button
                onClick={handleCopyPhone}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted hover:text-foreground"
                title="نسخ الرقم"
              >
                {copied
                  ? <Check className="h-3 w-3 text-emerald-500" />
                  : <Copy className="h-3 w-3" />
                }
              </button>
            </div>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3.5 hidden sm:table-cell">
        <CustomerStatusBadge status={status as any} />
      </td>

      {/* City */}
      <td className="px-3 py-3.5 hidden md:table-cell">
        <span className="text-sm text-muted">
          {customer.governorate || customer.city || "—"}
        </span>
      </td>

      {/* Total Spent */}
      <td className="px-3 py-3.5 hidden sm:table-cell">
        <div>
          <p className="text-sm font-bold text-foreground tabular-nums">
            {formatIQD(customer.total_spent)}
            <span className="text-xs font-normal text-muted mr-0.5"> د.ع</span>
          </p>
          <p className="text-xs text-muted">{customer.total_orders} طلب</p>
        </div>
      </td>

      {/* Last Order */}
      <td className="px-3 py-3.5 hidden lg:table-cell">
        <span className="text-sm text-muted">
          {relativeDate(customer.last_order_date)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleWhatsApp}
            className="p-1.5 rounded-xl text-muted hover:text-emerald-700 hover:bg-(--pastel-green)/40 transition-colors"
            title="واتساب"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded-xl text-muted hover:text-foreground hover:bg-background transition-colors"
            title="عرض الملف"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}
