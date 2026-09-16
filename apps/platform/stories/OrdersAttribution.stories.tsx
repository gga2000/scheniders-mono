import type { Meta, StoryObj } from "@storybook/nextjs";
import { FollowUpCueBadge } from "@/components/orders/follow-up-cue-badge";
import { ChannelPerformance } from "@/components/reports/channel-performance";
import { AdChannelFilter } from "@/components/orders/ad-channel-filter";
import { calculateChannelPerformance } from "@/lib/analytics/channel-metrics";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/types/order";

/**
 * The attribution surfaces, in the states that are hard to reach by hand.
 *
 * Reaching most of these live means finding an order whose follow-up is overdue
 * *and* whose last message was a different kind, or a tenant whose channel mix
 * is interesting — so they went unseen until a real one appeared in production.
 * They render here without a session.
 */
const meta: Meta = {
    title: "Orders/Attribution",
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <LanguageProvider>
                <div style={{ width: 900, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
                    <Story />
                </div>
            </LanguageProvider>
        ),
    ],
};
export default meta;

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

// ---------------------------------------------------------------- follow-up cue

type BadgeStory = StoryObj<typeof FollowUpCueBadge>;

/** Nothing sent yet: the cue pulses, because the work really is still owed. */
export const FollowUpStillOwed: BadgeStory = {
    render: () => (
        <div style={{ display: "flex" }}>
            <FollowUpCueBadge
            state={{ kind: "discount", sentBy: undefined, lastContactBy: undefined }}
            hoursSinceCreated={21}
            />
        </div>
    ),
};

/** The matching message went out: the badge goes calm and carries the sender. */
export const FollowUpHandled: BadgeStory = {
    render: () => (
        <div style={{ display: "flex" }}>
            <FollowUpCueBadge
            state={{
                kind: "discount",
                sentType: "discount",
                sentBy: { name: "علي واثق", isBot: false, at: hoursAgo(2) },
                lastContactBy: { name: "علي واثق", isBot: false, at: hoursAgo(2) },
            }}
            hoursSinceCreated={21}
            />
        </div>
    ),
};

/**
 * The state that sent me looking: the customer was messaged, but with a
 * *confirmation*, and a discount is now due. The cue stays loud and the earlier
 * sender rides beside it, muted — "they have heard from us" without pretending
 * the discount went out.
 */
export const FollowUpEarlierContactOfAnotherKind: BadgeStory = {
    render: () => (
        <div style={{ display: "flex" }}>
            <FollowUpCueBadge
            state={{
                kind: "discount",
                sentType: "confirmation",
                sentBy: undefined,
                lastContactBy: { name: "الإرسال التلقائي", isBot: true, at: hoursAgo(21) },
            }}
            hoursSinceCreated={21}
            />
        </div>
    ),
};

/** Nothing due, but someone made contact — a bare record, no alarm. */
export const FollowUpRecordOnly: BadgeStory = {
    render: () => (
        <div style={{ display: "flex" }}>
            <FollowUpCueBadge
            state={{
                kind: null,
                sentType: "manual",
                sentBy: { name: "سارة", isBot: false, at: hoursAgo(5) },
                lastContactBy: { name: "سارة", isBot: false, at: hoursAgo(5) },
            }}
            hoursSinceCreated={9}
            />
        </div>
    ),
};

// ------------------------------------------------------------ channel surfaces

let seq = 0;
const order = (channel: string, status: string, price: number): Order => ({
    id: `story-${++seq}`,
    order_id: String(7400 + seq),
    customer_name: "عميل",
    phone: "07700000000",
    city: "بغداد",
    status,
    price,
    items: [],
    created_at: hoursAgo(24),
    ad_channel: channel,
} as unknown as Order);

// Shaped after the live mix: TikTok matches Facebook on volume and collapses on
// delivery, which is the whole reason the card ranks by money rather than count.
const channelOrders: Order[] = [
    ...Array.from({ length: 38 }, () => order("instagram", "delivered", 40000)),
    ...Array.from({ length: 14 }, () => order("instagram", "confirmed", 40000)),
    ...Array.from({ length: 23 }, () => order("instagram", "new", 40000)),
    ...Array.from({ length: 13 }, () => order("facebook", "delivered", 43000)),
    ...Array.from({ length: 7 }, () => order("facebook", "confirmed", 43000)),
    ...Array.from({ length: 12 }, () => order("facebook", "new", 43000)),
    ...Array.from({ length: 3 }, () => order("tiktok", "delivered", 50000)),
    ...Array.from({ length: 3 }, () => order("tiktok", "confirmed", 50000)),
    ...Array.from({ length: 26 }, () => order("tiktok", "no_response", 50000)),
    order("threads", "delivered", 44750),
    ...Array.from({ length: 3 }, () => order("threads", "new", 44750)),
];

const RANGE = { from: new Date(Date.now() - 30 * 86400000), to: new Date() };

/** The reports card, on a mix shaped like the real one. */
export const ChannelPerformanceCard: StoryObj = {
    render: () => <ChannelPerformance data={calculateChannelPerformance(channelOrders, RANGE)} />,
};

/** Empty state: a tenant with no ad traffic should get a sentence, not a skeleton. */
export const ChannelPerformanceEmpty: StoryObj = {
    render: () => <ChannelPerformance data={[]} />,
};

/** The orders-page filter strip, unselected and with one channel pinned. */
export const ChannelFilterStrip: StoryObj = {
    render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <AdChannelFilter orders={channelOrders} selected={null} onSelect={() => {}} />
            <AdChannelFilter orders={channelOrders} selected="tiktok" onSelect={() => {}} />
        </div>
    ),
};
