import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import {
    AUTOMATION_SENDER_NAME,
    BOT_AVATAR,
    automationFollowUpStamp,
    followUpAlreadySent,
    followUpSender,
    followUpStamp,
    followUpState,
    senderDisplayName,
    sentAgoLabel,
} from "./follow-up-state";

function order(overrides: Partial<Order> = {}): Order {
    return {
        id: "o1",
        order_id: "7353",
        customer_name: "Barik",
        phone: "07838140244",
        items: [],
        price: 34750,
        status: "contacted",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-09-09T00:45:00.000Z",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

describe("followUpSender", () => {
    it("resolves a human sender with their avatar", () => {
        const sender = followUpSender(order({
            last_followup_by_name: "علي",
            last_followup_by_avatar: "https://example.com/a.png",
        }));
        expect(sender).toEqual({
            name: "علي",
            avatar: "https://example.com/a.png",
            isBot: false,
            at: undefined,
        });
    });

    it("treats the 'bot' sentinel as a bot with no photo", () => {
        const sender = followUpSender(order({
            last_followup_by_name: "النظام",
            last_followup_by_avatar: "bot",
        }));
        expect(sender?.isBot).toBe(true);
        expect(sender?.avatar).toBeUndefined();
    });

    it("still resolves a sender who simply has no avatar set", () => {
        const sender = followUpSender(order({ last_followup_by_name: "سارة" }));
        expect(sender?.isBot).toBe(false);
        expect(sender?.avatar).toBeUndefined();
    });

    it("returns nothing when there is no name behind the avatar", () => {
        // An avatar with nobody attached is worse than no avatar.
        expect(followUpSender(order({ last_followup_by_avatar: "https://x/a.png" }))).toBeUndefined();
        expect(followUpSender(order({ last_followup_by_name: "   " }))).toBeUndefined();
        expect(followUpSender(order())).toBeUndefined();
    });
});

describe("followUpAlreadySent", () => {
    const sent = { last_followup_by_name: "علي", last_followup_by_avatar: "bot" };

    it("matches when the recorded follow-up is the one now due", () => {
        expect(followUpAlreadySent(order({ ...sent, last_followup_type: "discount" }), "discount")).toBe(true);
    });

    it("does not let yesterday's reminder silence today's discount", () => {
        expect(followUpAlreadySent(order({ ...sent, last_followup_type: "reminder" }), "discount")).toBe(false);
    });

    it("ignores a confirmation — it is not a follow-up", () => {
        expect(followUpAlreadySent(order({ ...sent, last_followup_type: "confirmation" }), "reminder")).toBe(false);
    });

    it("is false when a type was recorded but no sender was", () => {
        expect(followUpAlreadySent(order({ last_followup_type: "discount" }), "discount")).toBe(false);
    });
});

describe("followUpState", () => {
    it("returns nothing when no follow-up is due", () => {
        expect(followUpState(order(), { needsReminder: false, needsDiscount: false })).toBeUndefined();
    });

    it("prefers discount over reminder when both are due", () => {
        const state = followUpState(order(), { needsReminder: true, needsDiscount: true });
        expect(state?.kind).toBe("discount");
    });

    it("carries the sender when that exact follow-up went out", () => {
        const state = followUpState(
            order({ last_followup_type: "discount", last_followup_by_name: "علي" }),
            { needsReminder: false, needsDiscount: true },
        );
        expect(state?.sentBy?.name).toBe("علي");
    });

    it("leaves the cue unattributed when the sent follow-up was a different kind", () => {
        const state = followUpState(
            order({ last_followup_type: "reminder", last_followup_by_name: "علي" }),
            { needsReminder: false, needsDiscount: true },
        );
        expect(state?.kind).toBe("discount");
        expect(state?.sentBy).toBeUndefined();
    });
});

describe("sentAgoLabel", () => {
    const now = new Date("2026-09-11T12:00:00.000Z");

    it("rounds through minutes, hours and days", () => {
        expect(sentAgoLabel("2026-09-11T11:59:40.000Z", now)).toBe("الآن");
        expect(sentAgoLabel("2026-09-11T11:30:00.000Z", now)).toBe("قبل 30 دقيقة");
        expect(sentAgoLabel("2026-09-11T09:00:00.000Z", now)).toBe("قبل 3 ساعة");
        expect(sentAgoLabel("2026-09-09T12:00:00.000Z", now)).toBe("قبل 2 يوم");
    });

    it("returns nothing for a missing or unparseable timestamp", () => {
        expect(sentAgoLabel(undefined, now)).toBeUndefined();
        expect(sentAgoLabel("not-a-date", now)).toBeUndefined();
    });

    it("never reports a negative age from small clock skew", () => {
        expect(sentAgoLabel("2026-09-11T12:00:30.000Z", now)).toBe("الآن");
    });
});

describe("followUpState — contact recorded with nothing due", () => {
    const nothingDue = { needsReminder: false, needsDiscount: false };

    it("still reports a manual send so the card can attribute it", () => {
        // The whole point: a plain WhatsApp send is not a scheduled follow-up, but
        // it is still contact, and the team needs to see who made it.
        const state = followUpState(
            order({ last_followup_type: "manual", last_followup_by_name: "علي" }),
            nothingDue,
        );
        expect(state?.kind).toBeNull();
        expect(state?.sentBy?.name).toBe("علي");
        expect(state?.sentType).toBe("manual");
    });

    it("reports a confirmation send the same way", () => {
        const state = followUpState(
            order({ last_followup_type: "confirmation", last_followup_by_name: "سارة" }),
            nothingDue,
        );
        expect(state?.kind).toBeNull();
        expect(state?.sentType).toBe("confirmation");
    });

    it("returns nothing when nothing is due and nobody has made contact", () => {
        expect(followUpState(order(), nothingDue)).toBeUndefined();
    });

    it("does not let a manual send silence a due discount", () => {
        // A manual "where are you?" message is not the discount the order is owed.
        const state = followUpState(
            order({ last_followup_type: "manual", last_followup_by_name: "علي" }),
            { needsReminder: false, needsDiscount: true },
        );
        expect(state?.kind).toBe("discount");
        expect(state?.sentBy).toBeUndefined();
        expect(state?.sentType).toBe("manual");
    });
});

describe("followUpState — earlier contact of a different kind", () => {
    it("reports who last contacted the customer even when the due message is still owed", () => {
        // The discount has not gone out, so the cue must stay loud — but the
        // customer has already heard from the system, and the agent needs to know
        // that before opening with "your order was received".
        const state = followUpState(
            order({
                last_followup_type: "confirmation",
                last_followup_by_name: "الإرسال التلقائي",
                last_followup_by_avatar: "bot",
            }),
            { needsReminder: false, needsDiscount: true },
        );

        expect(state?.kind).toBe("discount");
        expect(state?.sentBy).toBeUndefined();
        expect(state?.lastContactBy?.name).toBe("الإرسال التلقائي");
        expect(state?.lastContactBy?.isBot).toBe(true);
    });

    it("leaves the last contact unset when nobody has made any", () => {
        const state = followUpState(order(), { needsReminder: true, needsDiscount: false });
        expect(state?.kind).toBe("reminder");
        expect(state?.lastContactBy).toBeUndefined();
    });

    it("reports the same sender in both fields once the due message is the one that was sent", () => {
        const state = followUpState(
            order({ last_followup_type: "discount", last_followup_by_name: "علي" }),
            { needsReminder: false, needsDiscount: true },
        );
        expect(state?.sentBy?.name).toBe("علي");
        expect(state?.lastContactBy?.name).toBe("علي");
    });
});

describe("followUpStamp", () => {
    const at = new Date("2026-10-14T09:00:00.000Z");

    it("writes all four columns together, so an earlier sender is never left behind", () => {
        expect(followUpStamp({ name: "علي", avatar: "https://example.com/ali.png" }, "manual", at)).toEqual({
            last_followup_by_name: "علي",
            last_followup_by_avatar: "https://example.com/ali.png",
            last_followup_at: "2026-10-14T09:00:00.000Z",
            last_followup_type: "manual",
        });
    });

    it("clears the avatar explicitly when the sender has none", () => {
        expect(followUpStamp({ name: "علي" }, "reminder", at).last_followup_by_avatar).toBeNull();
        expect(followUpStamp({ name: "علي", avatar: "" }, "reminder", at).last_followup_by_avatar).toBeNull();
    });

    it("marks automation with the bot sentinel, which the resolver reads back as a bot", () => {
        const stamp = automationFollowUpStamp("confirmation", at);
        expect(stamp.last_followup_by_name).toBe(AUTOMATION_SENDER_NAME);
        expect(stamp.last_followup_by_avatar).toBe(BOT_AVATAR);
        expect(followUpSender(order(stamp))?.isBot).toBe(true);
    });
});

describe("senderDisplayName", () => {
    it("prefers the display name, then the email", () => {
        expect(senderDisplayName({ display_name: " علي " }, "ali@example.com")).toBe("علي");
        expect(senderDisplayName({ display_name: "  " }, "ali@example.com")).toBe("ali@example.com");
        expect(senderDisplayName(null, null)).toBeUndefined();
    });
});
