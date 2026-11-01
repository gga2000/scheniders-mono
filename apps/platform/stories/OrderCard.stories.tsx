import type { Meta, StoryObj } from "@storybook/nextjs";
import { OrderCard } from "@/components/orders/order-card";
import { LanguageProvider } from "@/components/providers/language-provider";
import { OrdersContext, type OrdersContextType } from "@/components/providers/orders-provider";
import type { Order } from "@/lib/supabase";

/**
 * The order card in its four layouts, at desktop width. Used to review text
 * size and badge fit without a live tenant.
 */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

const base = {
    customer_name: "علي حسين",
    phone: "07701234567",
    city: "بغداد",
    address_details: "الكرادة، قرب ساحة كهرمانة",
    items: [{ product_id: "p1", name: "Prime Serum 50ml", quantity: 2, price: 25000 }],
    price: 50000,
    delivery_fee: 5000,
    priority: "normal",
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    is_archived: false,
} as const;

const orders = [
    { ...base, id: "o1", order_id: "7001", status: "new", source: "whatsapp", priority: "urgent", created_at: hoursAgo(2) },
    { ...base, id: "o2", order_id: "7002", status: "contacted", source: "tiktok", priority: "high", created_at: hoursAgo(30), customer_name: "Zainab Kareem" },
    { ...base, id: "o3", order_id: "7003", status: "delivered", source: "meta", created_at: hoursAgo(72) },
    { ...base, id: "o4", order_id: "7004", status: "confirmed", source: "other", created_at: hoursAgo(5), secondary_phone: "07809876543" },
] as unknown as Order[];

const stubBook = { updateOrder: async () => ({ success: true }) } as unknown as OrdersContextType;
const noop = () => {};

function Cards({ compact, gridMode }: { compact: 0 | 1 | 2; gridMode?: boolean }) {
    return (
        <LanguageProvider>
            <OrdersContext.Provider value={stubBook}>
                <div className={gridMode ? "grid grid-cols-3 gap-2 p-4" : "space-y-3 p-4"} style={{ width: 1200 }}>
                    {orders.map((o) => (
                        <OrderCard
                            key={o.id}
                            order={o}
                            loadingId={null}
                            onStatusUpdate={noop}
                            onViewDetails={noop}
                            compact={compact}
                            gridMode={gridMode}
                            isVirtualized
                        />
                    ))}
                </div>
            </OrdersContext.Provider>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Cards> = { title: "Orders/OrderCard", component: Cards, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Cards>;

export const Full: Story = { args: { compact: 0 } };
export const SemiCompactGrid: Story = { args: { compact: 1, gridMode: true } };
export const UltraCompact: Story = { args: { compact: 2 } };
export const UltraCompactGrid: Story = { args: { compact: 2, gridMode: true } };
