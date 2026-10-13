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

export interface FeedGroup {
    /** Stable across live updates — the id of the oldest entry in the run. */
    key: string;
    /** Newest entry, the one actually rendered. */
    head: FeedNotification;
    /** Everything collapsed underneath it, newest first. */
    rest: FeedNotification[];
    unread: boolean;
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
        }

        if (!n.is_read) section.unread += 1;

        const prev = section.groups[section.groups.length - 1];
        if (prev && n.group_key && prev.head.group_key === n.group_key) {
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
