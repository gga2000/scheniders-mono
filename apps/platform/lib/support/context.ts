import type { SupportContext } from "@/lib/support/schema";

/** What the page knows when the merchant writes to support. */
export interface SupportContextInput {
    pathname: string;
    language: "ar" | "en";
    /** The order open on screen, if any. */
    orderNumber?: string | null;
    /** Set when the chat was opened from an error message. */
    errorCode?: string | null;
    errorMessage?: string | null;
    /** From the browser; absent on the server. */
    sentryEventId?: string | null;
    screen?: { width: number; height: number } | null;
    userAgent?: string | null;
}

const SENTRY_EVENT_ID = /^[0-9a-f]{32}$/;

/**
 * The facts sent with a support message so staff never have to ask "which
 * page?" or "what did it say?". Only the page path is kept — a query string
 * can carry a customer phone or a search, which support has no need for.
 * Anything empty or malformed is left out rather than sent.
 */
export function buildSupportContext(input: SupportContextInput): SupportContext {
    const context: SupportContext = { language: input.language };

    const path = input.pathname.split(/[?#]/)[0].slice(0, 300);
    if (path) context.path = path;
    if (input.orderNumber) context.orderNumber = input.orderNumber.slice(0, 64);
    if (input.errorCode) context.errorCode = input.errorCode.slice(0, 120);
    if (input.errorMessage) context.errorMessage = input.errorMessage.slice(0, 500);
    if (input.sentryEventId && SENTRY_EVENT_ID.test(input.sentryEventId)) context.sentryEventId = input.sentryEventId;
    if (input.screen && input.screen.width >= 10 && input.screen.height >= 10) {
        context.screen = `${Math.round(input.screen.width)}x${Math.round(input.screen.height)}`;
    }
    if (input.userAgent) context.userAgent = input.userAgent.slice(0, 300);

    return context;
}
