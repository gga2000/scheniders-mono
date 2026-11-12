import { describe, expect, it } from "vitest";
import { baseSentryOptions, isSensitiveKey, redactText, scrubSentryEvent, scrubValue } from "./sentry-scrub";

describe("redactText", () => {
    it.each([
        "07701234567",
        "0770 123 4567",
        "0770-123-4567",
        "7701234567",
        "+9647701234567",
        "+964 770 123 4567",
        "009647801234567",
        "9647501234567",
    ])("redacts the Iraqi mobile %s", (phone) => {
        expect(redactText(`customer ${phone} called`)).toBe("customer [phone] called");
    });

    it("redacts phones inside a Supabase REST filter URL", () => {
        expect(redactText("/rest/v1/customers?phone=eq.07801234567&select=id")).toBe(
            "/rest/v1/customers?phone=eq.[phone]&select=id",
        );
    });

    it("redacts emails", () => {
        expect(redactText("sent to someone.name+x@gmail.com ok")).toBe("sent to [email] ok");
    });

    it("keeps order numbers, Prime case ids, merchant codes and UUIDs", () => {
        const text = "order 4261102017 case 52399154 shop #100095 tenant b5c4f2d4-834f-4af4-822d-9b9826a8f45a";
        expect(redactText(text)).toBe(text);
    });
});

describe("isSensitiveKey", () => {
    it.each(["name", "customer_name", "customerName", "CUSTOMER-PHONE", "phone_number", "address", "shipping_address", "landmark", "nearest_point", "email", "notes", "accessToken", "api_key", "Authorization", "cookie", "ip_address"])(
        "flags %s",
        (key) => expect(isSensitiveKey(key)).toBe(true),
    );

    it.each(["pathname", "hostname", "tenant_id", "order_id", "status", "job", "step", "governorate", "total"])(
        "keeps %s",
        (key) => expect(isSensitiveKey(key)).toBe(false),
    );
});

describe("scrubValue", () => {
    it("blanks personal fields at any depth and keeps the rest", () => {
        const order = {
            order_id: "4261102017",
            total: 36000,
            customer: { full_name: "علي حسن", phone: "07701234567", city: "Kut" },
            items: [{ title: "Envoy", note: "اتصل قبل" }],
        };
        expect(scrubValue(order)).toEqual({
            order_id: "4261102017",
            total: 36000,
            customer: { full_name: "[redacted]", phone: "[redacted]", city: "Kut" },
            items: [{ title: "Envoy", note: "[redacted]" }],
        });
    });

    it("does not mutate its input", () => {
        const input = { phone: "07701234567" };
        scrubValue(input);
        expect(input.phone).toBe("07701234567");
    });
});

describe("scrubSentryEvent", () => {
    it("drops request bodies, cookies and unsafe headers", () => {
        const event = scrubSentryEvent({
            request: {
                url: "https://shop.scheniders.com/checkout?phone=07701234567",
                data: { name: "x", phone: "07701234567" },
                cookies: { sb: "secret" },
                headers: { "user-agent": "Mozilla", authorization: "Bearer abc", cookie: "sb=1", "upstash-signature": "sig" },
            },
        });
        expect(event.request).toEqual({
            url: "https://shop.scheniders.com/checkout?phone=[phone]",
            headers: { "user-agent": "Mozilla" },
        });
    });

    it("redacts exception messages, extras, breadcrumbs and custom contexts", () => {
        const event = scrubSentryEvent({
            message: "send to 07701234567 failed",
            exception: { values: [{ value: "Customer 07801234567 not found" }] },
            extra: { arguments: ["[Auto Follow-up] failed", { customer_phone: "07701234567", order_id: "1" }] },
            breadcrumbs: [{ message: "fetch /rest/v1/x?phone=eq.07701234567", data: { url: "/x?email=a@b.co" } }],
            contexts: { order: { customer_name: "Ali", status: "pending" }, os: { name: "Android" } },
            user: { id: "u1", email: "a@b.co", ip_address: "1.2.3.4" },
        });
        expect(event.message).toBe("send to [phone] failed");
        expect(event.exception?.values?.[0]?.value).toBe("Customer [phone] not found");
        expect(event.extra).toEqual({ arguments: ["[Auto Follow-up] failed", { customer_phone: "[redacted]", order_id: "1" }] });
        expect(event.breadcrumbs?.[0]).toEqual({ message: "fetch /rest/v1/x?phone=eq.[phone]", data: { url: "/x?email=[email]" } });
        expect(event.contexts?.order).toEqual({ customer_name: "[redacted]", status: "pending" });
        expect(event.contexts?.os).toEqual({ name: "Android" });
        expect(event.user).toEqual({ id: "u1" });
    });

    it("keeps tenant and role tags but redacts personal ones", () => {
        const event = scrubSentryEvent({ tags: { tenant_id: "t1", user_role: "owner", customer_phone: "07701234567" } });
        expect(event.tags).toEqual({ tenant_id: "t1", user_role: "owner", customer_phone: "[redacted]" });
    });
});

describe("baseSentryOptions", () => {
    it("stays off without a DSN and tags every event with its app", () => {
        const off = baseSentryOptions({ app: "storefront", dsn: undefined, vercelEnv: undefined, tracesSampleRate: 0.05 });
        expect(off.enabled).toBe(false);
        expect(off.environment).toBe("development");
        expect(off.sendDefaultPii).toBe(false);
        const on = baseSentryOptions({ app: "platform", dsn: "https://k@o1.ingest.sentry.io/1", vercelEnv: "production", tracesSampleRate: 0.2 });
        expect(on.enabled).toBe(true);
        expect(on.environment).toBe("production");
        expect(on.initialScope).toEqual({ tags: { app: "platform" } });
    });
});
