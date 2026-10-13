import type { Meta, StoryObj } from "@storybook/nextjs";
import { NotificationFeedList } from "@/components/layout/notification-feed-list";
import { LanguageProvider } from "@/components/providers/language-provider";
import { buildFeedSections, firstUnreadBoundary } from "@/lib/notification-feed-sections";
import type { FeedNotification } from "@/hooks/use-notification-feed";

/**
 * The Activity Feed list, at the 384px the dropdown gives it.
 *
 * It used to be one undifferentiated run of rows that re-sorted itself every
 * time a trigger wrote a row — during a bulk status change that is dozens a
 * second. Days are separated now, runs about one order fold into a single row,
 * and the dropdown holds arrivals behind a pill instead of splicing them in.
 */
const midday = (dayOffset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const note = (
    over: Partial<FeedNotification> & { id: string; created_at: string },
): FeedNotification => ({
    type: "order.status_changed",
    category: "orders",
    actor_name: "WhatsApp Bot",
    actor_avatar: "bot",
    entity_type: "order",
    entity_id: "o1",
    entity_label: "#118653464",
    payload: { old_status: "contacted", new_status: "confirmed" },
    priority: "normal",
    group_key: null,
    is_read: true,
    ...over,
});

/** Shaped after a live afternoon: automation churn, then an employee, then quiet. */
const feed: FeedNotification[] = [
    note({
        id: "n1",
        created_at: midday(0, 14),
        group_key: "order:118653464",
        is_read: false,
    }),
    note({
        id: "n2",
        created_at: midday(0, 13),
        group_key: "order:118653464",
        entity_label: "#118653464",
        payload: { old_status: "abandoned", new_status: "contacted" },
        is_read: false,
    }),
    note({
        id: "n3",
        created_at: midday(0, 12),
        type: "order.bulk_status_changed",
        entity_label: null,
        entity_type: null,
        entity_id: null,
        actor_name: "علي واثق",
        actor_avatar: null,
        payload: { count: 38, new_status: "in_transit" },
        is_read: false,
    }),
    note({
        id: "n4",
        created_at: midday(0, 11),
        type: "inventory.low_stock",
        category: "inventory",
        entity_label: "عطر برسيفيرون",
        payload: { stock: 3 },
        actor_name: "Automation",
        actor_avatar: null,
        priority: "urgent",
    }),
    note({
        id: "n5",
        created_at: midday(-1, 17),
        type: "order.created",
        entity_label: "#7421",
        payload: {},
        actor_name: "Automation",
        actor_avatar: null,
    }),
    note({
        id: "n6",
        created_at: midday(-1, 16),
        type: "chat.mention",
        category: "chat",
        entity_type: "conversation",
        entity_label: null,
        actor_name: "مصطفى",
        actor_avatar: null,
        payload: { preview: "راجع طلب #7421 الزبون غيّر العنوان" },
    }),
    note({
        id: "n7",
        created_at: midday(-4, 10),
        type: "finance.wallet_low",
        category: "finance",
        entity_type: null,
        entity_id: null,
        entity_label: null,
        payload: {},
        actor_name: "Automation",
        actor_avatar: null,
    }),
];

const Panel = ({ items }: { items: FeedNotification[] }) => {
    const sections = buildFeedSections(items);
    return (
        <LanguageProvider>
            <div className="w-96 max-h-[500px] overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                <NotificationFeedList
                    sections={sections}
                    unreadBoundary={firstUnreadBoundary(sections)}
                    openingId={null}
                    onOpen={() => {}}
                    onMarkRead={() => {}}
                    onDismiss={() => {}}
                    onMute={() => {}}
                />
            </div>
        </LanguageProvider>
    );
};

const meta: Meta<typeof Panel> = {
    title: "Notifications/Activity feed",
    component: Panel,
    parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Panel>;

/** Today, yesterday and an older day, each under its own heading. */
export const ThreeDays: Story = {
    args: { items: feed },
};

/** One order's run of updates collapses to a single row with a tally. */
export const FoldedRun: Story = {
    args: { items: feed.slice(0, 2) },
};

/** Nothing unread: no dot, no divider, no accent — the feed goes quiet. */
export const AllRead: Story = {
    args: { items: feed.map((n) => ({ ...n, is_read: true, priority: "normal" })) },
};
