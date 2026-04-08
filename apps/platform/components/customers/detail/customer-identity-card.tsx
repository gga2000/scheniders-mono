"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Copy, Check, Download, Ban,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerAvatar } from "../shared/customer-avatar";
import { CustomerStatusBadge } from "../shared/customer-status-badge";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import type { CustomerTag, CustomerTagAssignment } from "@/types/customer";
import { tagColorClasses } from "@/types/customer";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface MetricPillProps {
  label: string;
  value: string;
  sub?: string;
}

function MetricPill({ label, value, sub }: MetricPillProps) {
  return (
    <div className="rounded-2xl bg-background border border-(--card-border) px-3 py-2.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function formatIQD(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م د.ع`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}ك د.ع`;
  return `${n.toLocaleString()} د.ع`;
}

function relDate(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); }
  catch { return d; }
}

interface CustomerIdentityCardProps {
  customer: PaginatedCustomer;
  tags: CustomerTag[];
  assignments: CustomerTagAssignment[];
  onAddNote: () => void;
  onExport: () => void;
  onToggleBlacklist: () => void;
  onAssignTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
}

export function CustomerIdentityCard({
  customer,
  tags,
  assignments,
  onAddNote,
  onExport,
  onToggleBlacklist,
  onAssignTag,
  onRemoveTag,
}: CustomerIdentityCardProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

  const status = customer.is_blacklisted ? "blacklisted" : customer.calculated_status;
  const assignedTagIds = new Set(assignments.map((a) => a.tag_id));
  const assignedTags = tags.filter((t) => assignedTagIds.has(t.id));

  function copyPhone() {
    navigator.clipboard.writeText(customer.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 1500);
  }

  function openWhatsApp() {
    const cleaned = customer.phone.replace(/\D/g, "");
    const num = cleaned.startsWith("964") ? cleaned : `964${cleaned.replace(/^0/, "")}`;
    window.open(`https://wa.me/${num}`, "_blank");
  }

  const avgOrderValue = customer.total_orders > 0
    ? Math.round(customer.total_spent / customer.total_orders)
    : 0;

  return (
    <motion.aside
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-(--card-border) bg-(--card-bg) p-5"
    >
      {/* Avatar + Name */}
      <div className="flex flex-col items-center text-center gap-2">
        <CustomerAvatar
          name={customer.name}
          phone={customer.phone}
          status={status}
          size="lg"
        />
        <div>
          <h2 className="text-base font-bold text-foreground leading-tight">
            {customer.name}
          </h2>
          <CustomerStatusBadge status={status as any} size="sm" className="mt-1" />
        </div>
      </div>

      {/* Phone */}
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-background border border-(--card-border) px-3 py-2">
        <span className="font-mono text-sm text-foreground">{customer.phone}</span>
        <button onClick={copyPhone} className="p-1 rounded-lg text-muted hover:text-foreground transition-colors">
          {copiedPhone ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Metrics 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        <MetricPill label="الطلبات" value={customer.total_orders.toString()} />
        <MetricPill label="الإنفاق" value={formatIQD(customer.total_spent)} />
        <MetricPill label="متوسط الطلب" value={formatIQD(avgOrderValue)} />
        <MetricPill label="آخر طلب" value={relDate(customer.last_order_date)} />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={openWhatsApp}
          className="flex items-center justify-center gap-2 rounded-2xl bg-(--pastel-green) px-4 py-2.5 text-sm font-semibold text-zinc-800 transition-all hover:brightness-95 active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" />
          واتساب
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onAddNote}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-(--card-border) bg-background px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-background hover:border-(--border-hover)"
          >
            <StickyNote className="h-3.5 w-3.5" />
            ملاحظة
          </button>
          <button
            onClick={onExport}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-(--card-border) bg-background px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-background hover:border-(--border-hover)"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير
          </button>
        </div>

        <button
          onClick={onToggleBlacklist}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium transition-all",
            customer.is_blacklisted
              ? "border-(--pastel-pink) bg-(--pastel-pink)/30 text-rose-700 hover:bg-(--pastel-pink)/50"
              : "border-(--card-border) text-muted hover:border-(--pastel-pink) hover:bg-(--pastel-pink)/20 hover:text-rose-700"
          )}
        >
          <Ban className="h-3.5 w-3.5" />
          {customer.is_blacklisted ? "رفع الحظر" : "إضافة للقائمة السوداء"}
        </button>
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">التصنيفات</p>
          <button
            onClick={() => setTagMenuOpen(!tagMenuOpen)}
            className="text-xs text-muted hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            + إضافة
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {assignedTags.length === 0 && (
            <p className="text-xs text-muted">لا توجد تصنيفات</p>
          )}
          {assignedTags.map((tag) => {
            const colors = tagColorClasses[tag.color];
            return (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-opacity hover:opacity-70",
                  colors.bg, colors.text
                )}
                onClick={() => onRemoveTag(tag.id)}
                title="انقر للإزالة"
              >
                {tag.name}
              </span>
            );
          })}
        </div>

        {/* Tag picker dropdown */}
        <AnimatePresence>
          {tagMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="mt-2 rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-lg overflow-hidden"
            >
              {tags.filter((t) => !assignedTagIds.has(t.id)).map((tag) => {
                const colors = tagColorClasses[tag.color];
                return (
                  <button
                    key={tag.id}
                    onClick={() => { onAssignTag(tag.id); setTagMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-background transition-colors"
                  >
                    <span className={cn("h-2 w-2 rounded-full", colors.bg)} />
                    <span className={colors.text}>{tag.name}</span>
                  </button>
                );
              })}
              {tags.filter((t) => !assignedTagIds.has(t.id)).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">تم إضافة جميع التصنيفات</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Customer since */}
      <div className="rounded-2xl bg-background border border-(--card-border) px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">عميل منذ</p>
        <p className="mt-0.5 text-xs font-semibold text-foreground">
          {relDate(customer.first_order_date)}
        </p>
      </div>
    </motion.aside>
  );
}
