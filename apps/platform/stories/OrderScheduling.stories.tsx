import type { Meta, StoryObj } from "@storybook/nextjs";
import { OrderCard } from "@/components/orders/order-card";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";

/**
 * The order card in each of its scheduling states.
 *
 * Postponing an order used to mean editing its order date forward, which
 * overwrote `created_at`. That produced ages like "-1507m ago" and pinned
 * postponed orders to the top of the list. Placement date and scheduling date
 * are now separate fields, and these are the states that produces.
 */
const dayKey = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString("en-CA");
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

const baseOrder = {
    id: "story-order",
    order_id: "7309",
    sequence_number: 3384,
    customer_name: "علي واثق",
    phone: "07727838391",
    city: "بغداد",
    governorate_code: "BGD",
    address_details: "حي العامل قرب محطة وقود حي العامل",
    items: [{ name: "عطر برسيفيرون الفاخر من باريس كورنر للرجال", quantity: 1 }],
    price: 44750,
    status: "confirmed",
    priority: "normal",
    payment_status: "cod",
    source: "lightfunnels",
    is_return: false,
    is_archived: false,
    is_pinned: false,
    created_at: hoursAgo(3),
    original_created_at: null,
    scheduled_date: null,
} as unknown as Order;

const meta: Meta<typeof OrderCard> = {
    title: "Orders/Scheduling states",
    component: OrderCard,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <LanguageProvider>
                <div style={{ maxWidth: 1100 }}>
                    <Story />
                </div>
            </LanguageProvider>
        ),
    ],
    args: {
        loadingId: null,
        onStatusUpdate: () => {},
        onViewDetails: () => {},
    },
};
export default meta;

type Story = StoryObj<typeof OrderCard>;

/** Placed three hours ago, nobody has parked it. The age badge is the only time signal. */
export const Unscheduled: Story = {
    args: { order: baseOrder },
};

/**
 * Parked for a later day. The age badge stays truthful about when the order was
 * placed but drops to a neutral colour, because nobody is late on this work yet,
 * and a blue badge carries the day it comes back. In the list this order sinks
 * below the live queue instead of riding the top of it.
 */
export const ParkedForLater: Story = {
    args: {
        order: { ...baseOrder, created_at: hoursAgo(30), scheduled_date: dayKey(3) } as Order,
    },
};

/**
 * Its scheduled day has arrived. The urgency clock restarts at that day rather
 * than at placement, so an order parked a week ago is not instantly stale. This
 * is what the "due today" filter chip collects.
 */
export const DueToday: Story = {
    args: {
        order: { ...baseOrder, created_at: hoursAgo(24 * 7), scheduled_date: dayKey(0) } as Order,
    },
};

/**
 * A genuine backward correction of a mistyped date. This is the only case that
 * still writes `original_created_at`, and the amber badge names it. Hover the
 * badge for the date it was corrected from.
 */
export const DateCorrected: Story = {
    args: {
        order: {
            ...baseOrder,
            created_at: hoursAgo(50),
            original_created_at: hoursAgo(20),
        } as Order,
    },
};
