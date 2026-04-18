"use client";

import { motion } from "framer-motion";
import {
  Phone, MapPin, AlertTriangle, Ban,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import type { Order } from "@/types/order";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useLanguage } from "@/hooks/use-language";

interface CustomerDetailsSidebarProps {
  customer: PaginatedCustomer;
  orders: Order[];
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ElementType; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted">{label}</p>
        <p className={cn("text-xs font-medium text-foreground truncate", valueClass)}>{value || "—"}</p>
      </div>
    </div>
  );
}

export function CustomerDetailsSidebar({ customer, orders }: CustomerDetailsSidebarProps) {
  const { t, language } = useLanguage();
  // Compute most-used addresses from order history
  const addressCount = new Map<string, number>();
  orders.forEach((o) => {
    const addr = [o.city, o.address_details].filter(Boolean).join(" — ");
    if (addr) addressCount.set(addr, (addressCount.get(addr) ?? 0) + 1);
  });
  const topAddresses = [...addressCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Risk signals
  const daysSinceLastOrder = customer.last_order_date
    ? Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / 86_400_000)
    : null;

  const rejectedCount = orders.filter((o) => o.status === "rejected" || o.status === "cancelled").length;
  const rejectionRate = orders.length > 0 ? Math.round((rejectedCount / orders.length) * 100) : 0;

  const risks: { label: string; sub: string; level: "warn" | "danger" }[] = [];
  if (daysSinceLastOrder !== null && daysSinceLastOrder >= 30) {
    risks.push({ label: t("customers.details.notOrderedSince", { count: daysSinceLastOrder.toString() }), sub: t("customers.details.customerRisk"), level: "warn" });
  }
  if (rejectionRate >= 40) {
    risks.push({ label: t("customers.details.rejectionLabel", { rate: Math.round(rejectionRate).toString() }), sub: t("customers.details.rejectionSub", { count: rejectedCount.toString(), total: orders.length.toString() }), level: "danger" });
  }
  if (customer.is_blacklisted) {
    risks.push({ label: t("customers.details.blockedCustomer"), sub: t("customers.details.addedToBlacklist"), level: "danger" });
  }

  // Preferred city
  const cityCount = new Map<string, number>();
  orders.forEach((o) => { if (o.city) cityCount.set(o.city, (cityCount.get(o.city) ?? 0) + 1); });
  const preferredCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
      className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l border-(--card-border) bg-(--card-bg) p-5"
    >
      {/* Contact Info */}
      <SidebarSection title={t("customers.details.contactInfo")}>
        <div className="rounded-2xl border border-(--card-border) bg-background px-3 py-2 space-y-0.5">
          <InfoRow icon={Phone} label={t("customers.details.primaryPhone")} value={customer.phone} />
          {customer.secondary_phone && (
            <InfoRow icon={Phone} label={t("customers.details.secondaryPhone")} value={customer.secondary_phone} />
          )}
          <InfoRow icon={MapPin} label={t("customers.details.governorate")} value={customer.governorate || customer.city || ""} />
          {preferredCity && (
            <InfoRow icon={MapPin} label={t("customers.details.preferredCity")} value={preferredCity} />
          )}
        </div>
      </SidebarSection>

      {/* Address Book */}
      {topAddresses.length > 0 && (
        <SidebarSection title={t("customers.details.addressBook")}>
          <div className="space-y-1.5">
            {topAddresses.map(([addr, count]) => (
              <div key={addr} className="flex items-start gap-2 rounded-2xl border border-(--card-border) bg-background px-3 py-2">
                <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground leading-snug">{addr}</p>
                  <p className="text-[10px] text-muted mt-0.5">{t("customers.details.usedTimes", { count: count.toString() })}</p>
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>
      )}

      {/* Risk Signals */}
      {risks.length > 0 && (
        <SidebarSection title={t("customers.details.riskSignals")}>
          <div className="space-y-1.5">
            {risks.map((risk, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-2xl border px-3 py-2",
                  risk.level === "danger"
                    ? "border-(--pastel-pink) bg-(--pastel-pink)/20"
                    : "border-(--pastel-yellow) bg-(--pastel-yellow)/20"
                )}
              >
                {risk.level === "danger"
                  ? <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                }
                <div>
                  <p className={cn(
                    "text-xs font-semibold",
                    risk.level === "danger" ? "text-rose-700" : "text-amber-700"
                  )}>{risk.label}</p>
                  <p className={cn(
                    "text-[10px]",
                    risk.level === "danger" ? "text-rose-600" : "text-amber-600"
                  )}>{risk.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>
      )}

      {/* Quick Stats */}
      <SidebarSection title={t("customers.details.quickStats")}>
        <div className="space-y-1">
          <div className="flex items-center justify-between rounded-2xl px-2 py-1.5 hover:bg-background transition-colors">
            <span className="text-xs text-muted">{t("customers.details.customerSince")}</span>
            <span className="text-xs font-semibold text-foreground">
              {customer.first_order_date
                ? format(new Date(customer.first_order_date), "MMM yyyy", { locale: language === "ar" ? ar : enUS })
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl px-2 py-1.5 hover:bg-background transition-colors">
            <span className="text-xs text-muted">{t("customers.details.rejectionRate")}</span>
            <span className={cn(
              "text-xs font-semibold",
              rejectionRate >= 40 ? "text-rose-600" : rejectionRate >= 20 ? "text-amber-600" : "text-emerald-600"
            )}>
              {rejectionRate}%
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl px-2 py-1.5 hover:bg-background transition-colors">
            <span className="text-xs text-muted">{t("customers.details.totalOrders")}</span>
            <span className="text-xs font-semibold text-foreground">{customer.total_orders}</span>
          </div>
          {daysSinceLastOrder !== null && (
            <div className="flex items-center justify-between rounded-2xl px-2 py-1.5 hover:bg-background transition-colors">
              <span className="text-xs text-muted">{t("customers.table.lastOrder")}</span>
              <span className="text-xs font-semibold text-foreground">{t("customers.details.lastOrderDays", { count: daysSinceLastOrder.toString() })}</span>
            </div>
          )}
        </div>
      </SidebarSection>
    </motion.aside>
  );
}
