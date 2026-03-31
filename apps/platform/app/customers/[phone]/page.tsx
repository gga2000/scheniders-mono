"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Package, StickyNote, Activity, BarChart2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePaginatedCustomers } from "@/hooks/use-paginated-customers";
import { useCustomerNotes } from "@/hooks/use-customer-management";
import { useCustomerAssignmentsQuery, useCustomerTagsQuery } from "@/hooks/use-customers-query";
import { useAssignTagMutation, useRemoveTagMutation } from "@/hooks/use-customers-query";
import { CustomerIdentityCard } from "@/components/customers/detail/customer-identity-card";
import { CustomerOrdersTab } from "@/components/customers/detail/customer-orders-tab";
import { CustomerNotesTab } from "@/components/customers/detail/customer-notes-tab";
import { CustomerDetailsSidebar } from "@/components/customers/detail/customer-details-sidebar";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

type TabId = "orders" | "notes" | "activity";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "orders",   label: "الطلبات",    icon: Package },
  { id: "notes",    label: "الملاحظات",  icon: StickyNote },
  { id: "activity", label: "السجل",     icon: Activity },
];

// Fetch orders for a specific customer phone
function useCustomerOrders(phone: string) {
  return useQuery({
    queryKey: ["customer-orders", phone],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("phone", phone)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    enabled: !!phone,
    staleTime: 1000 * 60 * 2,
  });
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const phone = decodeURIComponent(params.phone as string);
  const [activeTab, setActiveTab] = useState<TabId>("orders");
  const [addingNote, setAddingNote] = useState(false);

  // Data
  const { data: ordersData, isLoading: ordersLoading } = useCustomerOrders(phone);
  const { notes, loading: notesLoading, addNote, updateNote, deleteNote } = useCustomerNotes(phone);
  const { data: allTags = [] } = useCustomerTagsQuery();
  const { data: assignments = [] } = useCustomerAssignmentsQuery(phone);
  const assignTagMutation = useAssignTagMutation();
  const removeTagMutation = useRemoveTagMutation();

  // Get customer profile from paginated hook (single result by phone)
  const { data: customerData, isLoading: customerLoading } = usePaginatedCustomers(1, {
    search: phone,
    sortBy: "last_order_date",
    sortOrder: "desc",
  });
  const customer = customerData?.pages[0]?.customers?.[0];
  const orders = ordersData ?? [];

  async function handleExport() {
    const { customerDataExport } = await import("@/lib/customer-data-export");
    await customerDataExport.downloadAsJSON(phone);
  }

  async function handleToggleBlacklist() {
    if (!customer) return;
    if (customer.is_blacklisted) {
      await supabase.from("blacklist").delete().eq("phone", phone);
    } else {
      await supabase.from("blacklist").insert({ phone });
    }
  }

  if (customerLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-(--card-border) border-t-foreground" />
          <p className="text-sm text-muted">جاري تحميل بيانات العميل...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted">لم يتم العثور على العميل</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          العودة
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Breadcrumb */}
      <header className="flex items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-4 py-3 sm:px-6">
        <button
          onClick={() => router.push("/customers")}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          العملاء
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted" />
        <span className="text-sm font-semibold text-foreground">{customer.name}</span>
      </header>

      {/* Body: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Identity card */}
        <CustomerIdentityCard
          customer={customer}
          tags={allTags}
          assignments={assignments}
          onAddNote={() => { setActiveTab("notes"); setAddingNote(true); }}
          onExport={handleExport}
          onToggleBlacklist={handleToggleBlacklist}
          onAssignTag={(tagId) => assignTagMutation.mutate({ phone, tagId })}
          onRemoveTag={(tagId) => removeTagMutation.mutate({ phone, tagId })}
        />

        {/* Center: Tabs */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-(--card-border) bg-(--card-bg) px-4 pt-3">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 pb-3 pt-1 text-sm font-medium transition-colors",
                    active ? "text-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.id === "orders" && orders.length > 0 && (
                    <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted">
                      {orders.length}
                    </span>
                  )}
                  {tab.id === "notes" && notes.length > 0 && (
                    <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted">
                      {notes.length}
                    </span>
                  )}
                  {active && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-foreground"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 bg-background">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {activeTab === "orders" && (
                  <CustomerOrdersTab orders={orders} isLoading={ordersLoading} />
                )}
                {activeTab === "notes" && (
                  <CustomerNotesTab
                    notes={notes}
                    isLoading={notesLoading}
                    onAdd={async (note) => { await addNote(note); }}
                    onUpdate={async (id, note) => { await updateNote(id, note); }}
                    onDelete={async (id) => { await deleteNote(id); }}
                  />
                )}
                {activeTab === "activity" && (
                  <ActivityLog orders={orders} notes={notes} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Right: Details sidebar */}
        <CustomerDetailsSidebar customer={customer} orders={orders} />
      </div>
    </div>
  );
}

// ── Inline Activity Log ──────────────────────────────────────
function ActivityLog({ orders, notes }: { orders: Order[]; notes: any[] }) {
  const events = useMemo(() => {
    const items: { date: Date; type: string; label: string; sub?: string; pastel: string; dotClass: string }[] = [];

    orders.forEach((o) => {
      items.push({
        date: new Date(o.created_at),
        type: "order",
        label: `طلب #${o.order_id}`,
        sub: getStatusLabel(o.status),
        pastel: "bg-(--pastel-blue)/40",
        dotClass: "bg-(--pastel-blue)",
      });
    });

    notes.forEach((n) => {
      items.push({
        date: new Date(n.created_at),
        type: "note",
        label: "ملاحظة مضافة",
        sub: n.note.slice(0, 60) + (n.note.length > 60 ? "..." : ""),
        pastel: "bg-(--pastel-yellow)/40",
        dotClass: "bg-(--pastel-yellow)",
      });
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [orders, notes]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Activity className="h-10 w-10 text-muted" />
        <p className="text-sm text-muted">لا توجد أنشطة بعد</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Timeline line */}
      <div className="absolute right-[19px] top-3 bottom-3 w-px bg-(--card-border)" />

      {events.map((ev, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: i * 0.03 }}
          className="relative flex items-start gap-3 pb-4 pr-10"
        >
          {/* Dot */}
          <div className={cn(
            "absolute right-3 mt-1 h-3.5 w-3.5 rounded-full border-2 border-(--card-bg) flex items-center justify-center",
            ev.dotClass
          )}>
            {ev.type === "order" ? <Package className="h-2 w-2 text-zinc-700" /> : <StickyNote className="h-2 w-2 text-zinc-700" />}
          </div>

          <div className="flex-1 pastel-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">{ev.label}</p>
              <span className="shrink-0 text-[10px] text-muted">
                {formatDistanceToNow(ev.date, { addSuffix: true, locale: ar })}
              </span>
            </div>
            {ev.sub && <p className="mt-0.5 text-[11px] text-muted">{ev.sub}</p>}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "جديد", confirmed: "مؤكد", delivered: "تم التوصيل",
    rejected: "مرفوض", cancelled: "ملغي", in_transit: "في الطريق",
    completed: "مكتمل", contacted: "تم التواصل", suspended: "معلق",
  };
  return map[status] ?? status;
}

