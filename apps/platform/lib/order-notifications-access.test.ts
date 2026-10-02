import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const APP_ROOT = path.resolve(__dirname, "..");
const FEED_HOOK = fs.readFileSync(
    path.join(APP_ROOT, "hooks/use-notification-feed.ts"),
    "utf8",
);

function grep(pattern: string): string {
    // grep exits 1 when there are no matches, which is the passing case here.
    return execSync(
        `grep -rn ${JSON.stringify(pattern)} ${JSON.stringify(APP_ROOT)} ` +
            `--include='*.ts' --include='*.tsx' --exclude='order-notifications-access.test.ts' ` +
            `--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=graphify-out || true`,
        { encoding: "utf8" },
    ).trim();
}

/**
 * Pins the Activity Feed's access path. Two separate regressions are guarded:
 *
 *  1. Reads must go through the `notification_feed` RPC. Per-user read/dismiss
 *     state lives in `notification_user_state`; a client reading a notification
 *     table directly would show the whole team one shared badge, which is the
 *     bug the unified model exists to prevent.
 *
 *  2. Nothing may DELETE from the base table. "Clear all" used to run
 *     `delete().neq('id', <zero uuid>)`, which erased the entire tenant's
 *     activity history for every team member on a single click. Clearing is a
 *     per-user dismissal now.
 *
 * See packages/supabase/migrations/20260911120000_fix_order_activity_notifications.sql
 */
describe("order notifications access path", () => {
    it("no client module reads either legacy notification table directly", () => {
        expect(grep('from("order_notifications")')).toBe("");
        expect(grep("from('order_notifications')")).toBe("");
        // The unified feed is the only read path; `notifications` itself is read
        // through the notification_feed RPC, never selected directly.
        expect(grep('from("notifications")')).toBe("");
    });

    it("the feed hook never deletes notifications", () => {
        expect(FEED_HOOK).not.toMatch(/\.delete\(\)/);
    });

    it("the feed hook reads through the notification_feed RPC", () => {
        expect(FEED_HOOK).toContain('rpc("notification_feed"');
        // The badge must be counted server-side, or pagination silently caps it
        // at the page size.
        expect(FEED_HOOK).toContain('rpc("notification_unread_count"');
    });

    /**
     * Bulk actions must not operate on the ids the dropdown happens to have
     * loaded. That capped them at one page of 50, so "Clear my feed" cleared 50
     * of a 12k backlog and the next 50 slid into view — it read as the button
     * barely working. Both go through server-stamped watermark RPCs instead.
     */
    it("bulk actions use the server-stamped watermark RPCs", () => {
        expect(FEED_HOOK).toContain("clear_notification_feed");
        expect(FEED_HOOK).toContain("mark_notifications_read");
        // No client-supplied timestamp may reach the watermark.
        expect(FEED_HOOK).not.toMatch(/cleared_before:/);
        expect(FEED_HOOK).not.toMatch(/read_before:/);
    });

    /**
     * Creation history has exactly one writer: the `trg_log_order_creation_history`
     * trigger on `orders`. It used to be written client-side in createOrder, which
     * meant only orders created through the form got one — LightFunnels webhook
     * ingestion wrote none (35.7% coverage vs 100% for every other source). A
     * second writer here would double-log every order created through the UI.
     */
    it("no client module writes the initial (from_status: null) history row", () => {
        const crud = fs.readFileSync(path.join(APP_ROOT, "hooks/use-order-crud.ts"), "utf8");
        expect(crud).not.toMatch(/from_status:\s*null/);
    });

    it("the feed localizes relative timestamps", () => {
        const list = fs.readFileSync(
            path.join(APP_ROOT, "components/layout/notification-feed-list.tsx"),
            "utf8",
        );
        expect(list).toContain("date-fns/locale");
        // The feed formats dates through one helper; that helper must pass a locale,
        // and no other call site may bypass it.
        const callLines = list
            .split("\n")
            .filter((l) => l.includes("formatDistanceToNowStrict("));
        expect(callLines).toHaveLength(1);
        expect(callLines[0]).toContain("locale");
        // Day headings are localized through the same locale object.
        expect(list).toContain('format(section.date, "EEEE, d MMMM", { locale: dateLocale })');
    });

    it("clicking an order notification opens the order", () => {
        const dropdown = fs.readFileSync(
            path.join(APP_ROOT, "components/layout/notifications-dropdown.tsx"),
            "utf8",
        );
        expect(dropdown).toContain("openOrderDetails");
        expect(dropdown).toContain("orderRepository.findById");
    });

    it("mention bulk actions scope by recipient, not by loaded ids", () => {
        const mentionSource = fs.readFileSync(
            path.join(APP_ROOT, "hooks/chat/use-mention-notifications.ts"),
            "utf8",
        );
        expect(mentionSource).toContain('.eq("recipient_id", user.id)');
        expect(mentionSource).toContain(".delete()");
    });
});
