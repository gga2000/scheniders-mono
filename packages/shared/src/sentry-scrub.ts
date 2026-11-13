// =====================================================================
// Sentry privacy scrubber + shared SDK options
// =====================================================================
// Shoppers' names, phones and addresses never leave our servers for Sentry.
// Every app's Sentry.init (browser, server, edge) runs every event through
// `scrubSentryEvent` before it is sent. Framework-neutral on purpose: no
// `@sentry/*` import, so packages/shared stays dependency-light and the
// shapes below are the minimal structural subset of Sentry's event types.
// =====================================================================

const REDACTED = "[redacted]";

/**
 * Keys whose VALUE is personal data or a credential. Keys are flattened to
 * snake_case first and matched on whole segments, so `customer_phone`,
 * `customerPhone` and `CUSTOMER-PHONE` match while `pathname` does not.
 */
const SENSITIVE_KEY =
    /(?:^|_)(?:name|names|phone|phones|mobile|whatsapp|address|addresses|street|landmark|nearest|email|emails|note|notes|comment|comments|message_body|password|passwd|secret|token|authorization|cookie|cookies|api_key|apikey|access_key|signature|ip_address|ip)(?:_|$)/;

/**
 * Iraqi mobile numbers in every shape customers type them: 07xx…, 7xx…,
 * +964 7xx…, 00964 7xx…, 9647xx…. No lookbehind: older in-app browsers
 * (TikTok, Instagram on old iOS) throw on it at parse time.
 */
const IRAQ_PHONE = /(?:(?:\+|00)964[\s-]?|\b964[\s-]?|\b0|\b)7[3-9]\d[\s-]?\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Headers worth keeping for debugging; everything else (cookies, auth, signatures) is dropped. */
const SAFE_HEADERS = new Set([
    "user-agent",
    "content-type",
    "content-length",
    "accept",
    "accept-language",
    "host",
    "x-vercel-id",
    "x-forwarded-host",
]);

/** Contexts the SDK itself fills (os, browser, trace …). Their `name` keys are not people. */
const SDK_CONTEXTS = new Set([
    "app",
    "browser",
    "cloud_resource",
    "culture",
    "device",
    "os",
    "otel",
    "response",
    "runtime",
    "trace",
    "nextjs",
    "react",
    "state",
    "monitor",
]);

const MAX_DEPTH = 8;

/** An error's class name ("TypeError", "TimeoutError"): code, not a person. */
const ERROR_CLASS_NAME = /^(?:[A-Z][A-Za-z]*)?(?:Error|Exception)$/;

/** What the SDK writes for an exception that was a plain object, e.g. a Supabase error. */
const PLAIN_OBJECT_EXCEPTION = /^Object captured as exception with keys:/;

function normaliseKey(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[-\s.]/g, "_")
        .toLowerCase();
}

export function isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY.test(normaliseKey(key));
}

/** Replace phone numbers and emails inside free text (error messages, URLs, log lines). */
export function redactText(text: string): string {
    return text.replace(EMAIL, "[email]").replace(IRAQ_PHONE, "[phone]");
}

/** Deep copy with sensitive keys blanked and phones/emails in strings redacted. */
export function scrubValue(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return redactText(value);
    if (value === null || typeof value !== "object") return value;
    if (depth >= MAX_DEPTH) return "[depth limit]";
    if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
        const keep = key === "name" && typeof inner === "string" && ERROR_CLASS_NAME.test(inner);
        out[key] = !keep && isSensitiveKey(key) && inner !== null && inner !== undefined ? REDACTED : scrubValue(inner, depth + 1);
    }
    return out;
}

function scrubRecord(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!record) return record;
    return scrubValue(record) as Record<string, unknown>;
}

interface ScrubbableRequest {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    env?: unknown;
}

interface ScrubbableBreadcrumb {
    message?: string;
    data?: Record<string, unknown>;
}

interface ScrubbableSpan {
    description?: string;
    data?: Record<string, unknown>;
}

/** The structural subset of Sentry's ErrorEvent / TransactionEvent this scrubber touches. */
export interface ScrubbableEvent {
    logentry?: { message?: string; params?: unknown[] };
    message?: string;
    transaction?: string;
    exception?: { values?: Array<{ value?: string }> };
    request?: ScrubbableRequest;
    extra?: Record<string, unknown>;
    contexts?: Record<string, Record<string, unknown> | undefined>;
    tags?: Record<string, unknown>;
    breadcrumbs?: ScrubbableBreadcrumb[];
    spans?: ScrubbableSpan[];
    user?: { id?: string | number; [key: string]: unknown };
}

function scrubRequest(request: ScrubbableRequest): void {
    if (request.url) request.url = redactText(request.url);
    if (typeof request.query_string === "string") request.query_string = redactText(request.query_string);
    else if (request.query_string !== undefined) request.query_string = scrubValue(request.query_string);
    // Request bodies are checkout forms and webhook payloads: customer data by
    // definition. Never sent, whatever the SDK captured.
    delete request.data;
    delete request.cookies;
    delete request.env;
    if (request.headers) {
        const kept: Record<string, string> = {};
        for (const [name, value] of Object.entries(request.headers)) {
            if (SAFE_HEADERS.has(name.toLowerCase())) kept[name] = redactText(value);
        }
        request.headers = kept;
    }
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
    if (crumb.message) crumb.message = redactText(crumb.message);
    if (crumb.data) crumb.data = scrubRecord(crumb.data);
    return crumb;
}

function messageOf(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
    return undefined;
}

/**
 * `console.error("[queries.listProducts]", error)` with a Supabase error (a
 * plain object, not an Error) reaches Sentry titled "[queries.listProducts]
 * [object Object]", which hides the cause. Rebuild the title from the logged
 * arguments, using each object's `message`, so it reads "... TimeoutError: …".
 */
function readableTitles(event: ScrubbableEvent): void {
    const args = event.extra?.arguments;
    if (event.message?.includes("[object Object]") && Array.isArray(args)) {
        const parts = args.map((arg) => messageOf(arg) ?? String(arg));
        event.message = parts.join(" ");
        if (event.logentry?.message) event.logentry.message = event.message;
    }
    const serialized = messageOf(event.extra?.__serialized__);
    for (const ex of event.exception?.values ?? []) {
        if (serialized && ex.value && PLAIN_OBJECT_EXCEPTION.test(ex.value)) ex.value = serialized;
    }
}

/**
 * Strip personal data from a Sentry event in place and return it.
 * Used as `beforeSend` and `beforeSendTransaction` in every app.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
    readableTitles(event);
    if (event.message) event.message = redactText(event.message);
    if (event.logentry?.message) event.logentry.message = redactText(event.logentry.message);
    if (event.transaction) event.transaction = redactText(event.transaction);
    for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = redactText(ex.value);
    }
    if (event.request) scrubRequest(event.request);
    event.extra = scrubRecord(event.extra);
    if (event.tags) {
        for (const [key, value] of Object.entries(event.tags)) {
            event.tags[key] = isSensitiveKey(key) ? REDACTED : typeof value === "string" ? redactText(value) : value;
        }
    }
    if (event.contexts) {
        for (const [key, ctx] of Object.entries(event.contexts)) {
            if (!ctx || SDK_CONTEXTS.has(key)) continue;
            event.contexts[key] = scrubRecord(ctx);
        }
    }
    for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb);
    for (const span of event.spans ?? []) {
        if (span.description) span.description = redactText(span.description);
        if (span.data) span.data = scrubRecord(span.data);
    }
    // Only the opaque user id identifies who hit the error; no email, name or IP.
    if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
    return event;
}

/** Browser noise that is never our bug: extensions, a benign layout warning. */
export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    // Node prints this to stderr when a library uses an experimental API.
    /ExperimentalWarning:/,
];

export const SENTRY_DENY_URLS: RegExp[] = [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
    /extensions\//i,
];

/** Vercel's deployment environment ("production" | "preview" | "development"). */
export function sentryEnvironment(vercelEnv: string | undefined): string {
    return vercelEnv && vercelEnv.length > 0 ? vercelEnv : "development";
}

export interface BaseSentryOptionsInput {
    /** Which app sent the event. All three apps share one Sentry project and are told apart by this tag. */
    app: "platform" | "storefront" | "admin";
    /** NEXT_PUBLIC_SENTRY_DSN, read with a literal `process.env.` so Next inlines it. */
    dsn: string | undefined;
    /** VERCEL_ENV on the server, NEXT_PUBLIC_VERCEL_ENV in the browser. */
    vercelEnv: string | undefined;
    tracesSampleRate: number;
}

/**
 * The options every Sentry.init in the monorepo shares. Apps spread this and
 * add only runtime-specific integrations. No DSN means Sentry stays off
 * (local dev, CI) instead of erroring.
 */
export function baseSentryOptions({ app, dsn, vercelEnv, tracesSampleRate }: BaseSentryOptionsInput) {
    return {
        dsn,
        enabled: Boolean(dsn),
        environment: sentryEnvironment(vercelEnv),
        sendDefaultPii: false,
        tracesSampleRate,
        initialScope: { tags: { app } },
        ignoreErrors: SENTRY_IGNORE_ERRORS,
        denyUrls: SENTRY_DENY_URLS,
        beforeSend: scrubSentryEvent,
        beforeSendTransaction: scrubSentryEvent,
        beforeBreadcrumb: scrubBreadcrumb,
    };
}
