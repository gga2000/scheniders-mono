// apps/platform/lib/notification-feed-sections.ts
//
// Shapes the flat `notification_feed` result into what the dropdown renders:
// day sections, each holding runs of related entries folded into one row.
//
// The feed is live — rows arrive while the panel is open — so every identity
// here has to survive an update. A group is keyed by its OLDEST member rather
// than its newest: a newer entry folding into the run replaces the head, and
// keying on the head would change the React key, remount the row and make the
// list visibly jump.

import type { FeedNotification } from "@/hooks/use-notification-feed";

/**
 * Local calendar day as "YYYY-MM-DD". Compared as strings, so no timezone
 * conversion can shift an entry into the wrong day.
 */
const localDayKey = (date: Date) => date.toLocaleDateString("en-CA");

const STATUS_CHANGED = "order.status_changed";
const HOUR_MS = 3_600_000;

/**
 * What the bell counts as one. Order status changes in the same hour are one
 * (they show as one line, "14 orders changed"); everything else is itself.
 *
 * The hour is the UTC hour. Iraq is UTC+3 with no daylight saving, so it is
 * the hour the reader sees. `notification_unread_count()` uses the same key
 * (migration 20261111132409); keep the two in step.
 */
export function unreadUnitKey(n: Pick<FeedNotification, "id" | "type" | "created_at">): string {
    if (n.type !== STATUS_CHANGED) return n.id;
    return `status-hour:${Math.floor(new Date(n.created_at).getTime() / HOUR_MS)}`;
}

/** How many separate unread things the loaded feed holds, as the bell counts them. */
export function countUnreadUnits(items: FeedNotification[]): number {
    const units = new Set<string>();
    for (const n of items) if (!n.is_read) units.add(unreadUnitKey(n));
    return units.size;
}

export interface FeedGroup {
    /** Stable across live updates — the id of the oldest entry in the run. */
    key: string;
    /** Newest entry, the one actually rendered. */
    head: FeedNotification;
    /** Everything collapsed underneath it, newest first. */
    rest: FeedNotification[];
    unread: boolean;
    /**
     * Set when this group is an hour of order status changes: the start of
     * that hour. Such a group shows as one summary line once it holds two or
     * more changes, and opens to list them.
     */
    statusHour?: Date;
}

export type DayBucket = "today" | "yesterday" | "earlier";

export interface FeedSection {
    /** Local calendar day, "YYYY-MM-DD". */
    key: string;
    bucket: DayBucket;
    /** A date inside the section, for formatting the "earlier" heading. */
    date: Date;
    groups: FeedGroup[];
    unread: number;
}

/**
 * Split the feed by local calendar day, folding runs of adjacent entries that
 * share a `group_key` inside each day.
 *
 * Only consecutive rows are folded, so a busy order cannot swallow unrelated
 * activity that happened in between — the feed stays chronological, it just
 * stops repeating itself.
 *
 * Order status changes are the exception: about 2 of every 3 notifications
 * are one, so all the status changes of one hour become one group, wherever
 * they sit in that hour. The group stays where its newest change is; other
 * alerts in between keep their own lines. Its key is the hour itself, so it
 * survives live updates and older pages loading in.
 */
export function buildFeedSections(
    items: FeedNotification[],
    now: Date = new Date(),
): FeedSection[] {
    const todayKey = localDayKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = localDayKey(yesterday);

    const sections: FeedSection[] = [];
    // Hour groups of the current section, by unit key.
    let hours = new Map<string, FeedGroup>();

    for (const n of items) {
        const date = new Date(n.created_at);
        if (isNaN(date.getTime())) continue;
        const key = localDayKey(date);

        let section = sections[sections.length - 1];
        if (!section || section.key !== key) {
            section = {
                key,
                bucket:
                    key === todayKey ? "today" : key === yesterdayKey ? "yesterday" : "earlier",
                date,
                groups: [],
                unread: 0,
            };
            sections.push(section);
            hours = new Map();
        }

        if (n.type === STATUS_CHANGED) {
            const unit = unreadUnitKey(n);
            const hour = hours.get(unit);
            if (hour) {
                hour.rest.push(n);
                if (!n.is_read && !hour.unread) section.unread += 1;
                hour.unread = hour.unread || !n.is_read;
                continue;
            }
            const start = new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
            const group: FeedGroup = { key: unit, head: n, rest: [], unread: !n.is_read, statusHour: start };
            if (!n.is_read) section.unread += 1;
            hours.set(unit, group);
            section.groups.push(group);
            continue;
        }

        if (!n.is_read) section.unread += 1;

        const prev = section.groups[section.groups.length - 1];
        if (prev && !prev.statusHour && n.group_key && prev.head.group_key === n.group_key) {
            prev.rest.push(n);
            prev.unread = prev.unread || !n.is_read;
            // The run's anchor is its oldest member, which is the one that
            // doesn't move when newer entries fold in above it.
            prev.key = n.id;
            continue;
        }

        section.groups.push({ key: n.id, head: n, rest: [], unread: !n.is_read });
    }

    return sections;
}

/**
 * The key of the first unread group, but only when there is a read group above
 * it — the "New" divider marks a boundary, and without one it marks nothing.
 */
export function firstUnreadBoundary(sections: FeedSection[]): string | null {
    let seenRead = false;
    for (const section of sections) {
        for (const group of section.groups) {
            if (group.unread) return seenRead ? group.key : null;
            seenRead = true;
        }
    }
    return null;
}
