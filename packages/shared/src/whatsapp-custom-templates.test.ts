import { describe, expect, it } from "vitest";
import {
    CUSTOM_FIELD_TOKENS_AR,
    CUSTOM_TEMPLATE_FIELDS,
    CUSTOM_TEMPLATE_PURPOSES,
    FERMI_ORDER_TEMPLATE_BODIES,
    bodyFromLabels,
    bodyToLabels,
    customTemplateProblem,
    customTemplateVariables,
    fillCustomTemplate,
    normalizeCustomTemplateBody,
    numberedTemplateBody,
    type CustomFieldLabels,
    type CustomTemplateField,
} from "./whatsapp-custom-templates";
import { customTemplatePurposeOf, whatsappPurposeOf } from "./whatsapp-templates";

const LABELS: CustomFieldLabels = CUSTOM_FIELD_TOKENS_AR;

describe("customTemplateProblem (same rules as custom_whatsapp_template_problem)", () => {
    it.each([
        ["confirmation", "هلا {customer_name}، طلبك من {store_name} وصلنا.", null],
        ["confirmation", "{customer_name} طلبك من {store_name}", "field_at_edge"],
        ["confirmation", "طلبك من {store_name}", "field_at_edge"],
        ["confirmation", "طلبك من متجرنا", "no_store_name"],
        ["confirmation", "شوف {store_name} على shop.com هنا", "link"],
        ["confirmation", "شوف {store_name} https://x هنا", "link"],
        ["confirmation", "شوف {store_name} WWW.x هنا", "link"],
        ["confirmation", "خصم {discount} من {store_name} هسه", "unknown_field"],
        ["discount", "خصم {discount} من {store_name} هسه", null],
        ["confirmation", "هلا {store_name} {oops} هسه", "unknown_field"],
        ["confirmation", "هلا {{1}} {store_name} هسه", "unknown_field"],
        ["confirmation", "هلا {store_name} { هسه", "unknown_field"],
        ["confirmation", "   \n ", "empty"],
    ] as const)("%s %j -> %s", (purpose, body, problem) => {
        expect(customTemplateProblem(purpose, body)).toBe(problem);
    });

    it("counts characters, not UTF-16 units, against the 1024 limit", () => {
        const fill = "🌷".repeat(1000);
        expect(customTemplateProblem("confirmation", `من {store_name} ${fill}`)).toBeNull();
        expect(customTemplateProblem("confirmation", `من {store_name} ${"ا".repeat(1024)}`)).toBe("too_long");
    });

    it("trims the ends the way the database does", () => {
        expect(normalizeCustomTemplateBody("\r\n  هلا {store_name}\r\nهسه \t")).toBe("هلا {store_name}\nهسه");
        expect(customTemplateProblem("reminder", "  هلا {store_name} هسه  \n")).toBeNull();
    });
});

describe("numbering", () => {
    const body = "هلا {customer_name}، طلبك من {store_name} رقم {order_number}. للاستفسار {store_name} على {store_whatsapp} وشكراً";

    it("numbers fields in order, a repeated field twice", () => {
        expect(customTemplateVariables(body)).toEqual([
            "customer_name",
            "store_name",
            "order_number",
            "store_name",
            "store_whatsapp",
        ]);
        expect(numberedTemplateBody(body)).toBe("هلا {{1}}، طلبك من {{2}} رقم {{3}}. للاستفسار {{4}} على {{5}} وشكراً");
    });

    it("fills each field with its value", () => {
        const values = Object.fromEntries(CUSTOM_TEMPLATE_FIELDS.map((k) => [k, `<${k}>`])) as Record<CustomTemplateField, string>;
        expect(fillCustomTemplate(body, values)).toBe(
            "هلا <customer_name>، طلبك من <store_name> رقم <order_number>. للاستفسار <store_name> على <store_whatsapp> وشكراً",
        );
    });
});

describe("editor labels", () => {
    it("round-trips between the shop's labels and key form", () => {
        const typed = "هلا {اسم الزبون}، طلبك من { اسم المتجر } وصلنا";
        const body = bodyFromLabels(typed, LABELS);
        expect(body).toBe("هلا {customer_name}، طلبك من {store_name} وصلنا");
        expect(bodyToLabels(body, LABELS)).toBe("هلا {اسم الزبون}، طلبك من {اسم المتجر} وصلنا");
    });

    it("accepts a key typed as is and leaves an unknown name for the check to catch", () => {
        const body = bodyFromLabels("هلا {customer_name} من {اسم المتجر} {شي ثاني} هسه", LABELS);
        expect(body).toBe("هلا {customer_name} من {store_name} {شي ثاني} هسه");
        expect(customTemplateProblem("confirmation", body)).toBe("unknown_field");
    });
});

describe("names", () => {
    it("reads which message a custom template replaces", () => {
        expect(customTemplatePurposeOf("custom_confirmation_100095_2")).toBe("confirmation");
        expect(customTemplatePurposeOf("custom_discount_100012_1")).toBe("discount");
        expect(customTemplatePurposeOf("custom_confirmation_x_1")).toBeNull();
        expect(customTemplatePurposeOf("cod_order_confirm_v3")).toBeNull();
        expect(whatsappPurposeOf("custom_reminder_100095_1")).toBe("reminder");
        expect(whatsappPurposeOf("cod_order_confirm_v3")).toBe("confirmation");
    });
});

describe("Fermi's own wording, where the editor starts", () => {
    it.each(CUSTOM_TEMPLATE_PURPOSES)("passes every rule for %s", (purpose) => {
        expect(customTemplateProblem(purpose, FERMI_ORDER_TEMPLATE_BODIES[purpose])).toBeNull();
    });

    it("fills the confirmation in Fermi's variable order", () => {
        expect(customTemplateVariables(FERMI_ORDER_TEMPLATE_BODIES.confirmation)).toEqual([
            "customer_name", "store_name", "order_number", "products", "address", "phone", "total", "store_name", "store_whatsapp",
        ]);
    });
});
