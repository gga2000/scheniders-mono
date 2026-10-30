// `.catch()` wrappers (used for back-compat on section props) must not hide
// the control a field would otherwise get in the builder.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inferField, unwrap } from "./auto-form-schema";

describe("unwrap", () => {
    it("walks through .catch() to the wrapped type", () => {
        const layout = z.enum(["grid", "carousel", "stack"]).optional().catch("grid");
        const inner = unwrap(layout);
        expect((inner.schema._def as { type?: string }).type).toBe("enum");
        expect(inner.optional).toBe(true);
    });

    it("an enum behind .catch() still renders as a select", () => {
        const layout = z.enum(["grid", "carousel", "stack"]).optional().catch("grid");
        expect(inferField(layout).field).toEqual({
            kind: "enum",
            options: ["grid", "carousel", "stack"],
        });
    });

    it("a .catch(undefined) optional string still renders as text", () => {
        expect(inferField(z.string().optional().catch(undefined)).field.kind).toBe("string");
    });
});
