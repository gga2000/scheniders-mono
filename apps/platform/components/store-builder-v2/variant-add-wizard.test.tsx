/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type {
    AudienceSegment,
    Experiment,
    Variant,
    VariantCondition,
} from "@scheniders/shared";

import { VariantAddWizard } from "./variant-add-wizard";

afterEach(() => {
    cleanup();
});

describe("VariantAddWizard", () => {
    it("returns null when closed", () => {
        const { container } = render(
            <VariantAddWizard
                open={false}
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("step 1 shows 9 kind cards", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        const kinds: Array<VariantCondition["kind"]> = [
            "locale",
            "breakpoint",
            "time_window",
            "audience",
            "ab_test",
            "governorate",
            "product",
            "category",
            "page",
        ];
        for (const k of kinds) {
            expect(screen.getByTestId(`variant-add-wizard-kind-${k}`)).toBeTruthy();
        }
    });

    it("picking locale → step 2 shows locale checkboxes", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-locale"));
        expect(screen.getByTestId("variant-wizard-locale")).toBeTruthy();
        expect(screen.getByTestId("variant-wizard-locale-ar")).toBeTruthy();
        expect(screen.getByTestId("variant-wizard-locale-en")).toBeTruthy();
        expect(screen.getByTestId("variant-wizard-locale-ku")).toBeTruthy();
    });

    it("selecting ar + en + submit creates variant with locale condition", () => {
        const onAdd = vi.fn();
        const onClose = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={onClose}
                onAdd={onAdd}
                existingVariantCount={2}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-locale"));
        fireEvent.click(screen.getByTestId("variant-wizard-locale-ar"));
        fireEvent.click(screen.getByTestId("variant-wizard-locale-en"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-next"));
        // Step 3 — submit
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        expect(onAdd).toHaveBeenCalledTimes(1);
        const v = onAdd.mock.calls[0][0] as Variant;
        expect(v.conditions).toHaveLength(1);
        expect(v.conditions[0]).toEqual({ kind: "locale", values: ["ar", "en"] });
        expect(v.priority).toBe(3); // existingVariantCount + 1
        expect(v.enabled).toBe(true);
        expect(v.id.length).toBeGreaterThan(0);
        expect(onClose).toHaveBeenCalled();
    });

    it("time_window step has two datetime inputs and a timezone select", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-time_window"));
        expect(
            (screen.getByTestId("variant-wizard-time-start") as HTMLInputElement).type,
        ).toBe("datetime-local");
        expect(
            (screen.getByTestId("variant-wizard-time-end") as HTMLInputElement).type,
        ).toBe("datetime-local");
        const tz = screen.getByTestId("variant-wizard-time-tz") as HTMLSelectElement;
        expect(tz.value).toBe("Asia/Baghdad");
    });

    it("ab_test with empty experiments shows helper text", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                experiments={[]}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-ab_test"));
        expect(screen.getByTestId("variant-wizard-ab-test-empty")).toBeTruthy();
    });

    it("ab_test with experiments shows experiment select", () => {
        const experiments: Experiment[] = [
            {
                id: "exp-1",
                name: "Hero CTA test",
                status: "running",
                primary_metric: "orders",
                arms: [
                    { id: "control", label: "Control", traffic_pct: 50 },
                    { id: "v1", label: "Variant 1", traffic_pct: 50 },
                ],
            },
        ];
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                experiments={experiments}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-ab_test"));
        const expSelect = screen.getByTestId("variant-wizard-ab-exp") as HTMLSelectElement;
        expect(expSelect).toBeTruthy();
        fireEvent.change(expSelect, { target: { value: "exp-1" } });
        expect(screen.getByTestId("variant-wizard-ab-arm")).toBeTruthy();
    });

    it("audience with empty segments shows helper text", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                segments={[]}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-audience"));
        expect(screen.getByTestId("variant-wizard-audience-empty")).toBeTruthy();
    });

    it("audience with segments creates audience condition on submit", () => {
        const segments: AudienceSegment[] = [
            { id: "seg-1", name: "New customers", rules: [], combine: "all" },
        ];
        const onAdd = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={onAdd}
                existingVariantCount={0}
                segments={segments}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-audience"));
        fireEvent.change(screen.getByTestId("variant-wizard-audience-select"), {
            target: { value: "seg-1" },
        });
        fireEvent.click(screen.getByTestId("variant-add-wizard-next"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        const v = onAdd.mock.calls[0][0] as Variant;
        expect(v.conditions[0]).toEqual({ kind: "audience", segment_id: "seg-1" });
    });

    it("governorate picker selects chips and creates governorate condition", () => {
        const onAdd = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={onAdd}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-governorate"));
        fireEvent.click(screen.getByTestId("variant-wizard-governorate-BG"));
        fireEvent.click(screen.getByTestId("variant-wizard-governorate-BA"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-next"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        const v = onAdd.mock.calls[0][0] as Variant;
        expect(v.conditions[0]).toEqual({
            kind: "governorate",
            values: ["BG", "BA"],
        });
    });

    it("page picker selects pages", () => {
        const onAdd = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={onAdd}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-page"));
        fireEvent.click(screen.getByTestId("variant-wizard-page-home"));
        fireEvent.click(screen.getByTestId("variant-wizard-page-product"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-next"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        const v = onAdd.mock.calls[0][0] as Variant;
        expect(v.conditions[0]).toEqual({
            kind: "page",
            values: ["home", "product"],
        });
    });

    it("Next button is disabled with no locale selected", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-kind-locale"));
        const next = screen.getByTestId("variant-add-wizard-next") as HTMLButtonElement;
        expect(next.disabled).toBe(true);
    });

    it("renders all 4 preset cards at the top of step 1", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        expect(screen.getByTestId("variant-add-wizard-preset-holiday")).toBeTruthy();
        expect(screen.getByTestId("variant-add-wizard-preset-mobile")).toBeTruthy();
        expect(screen.getByTestId("variant-add-wizard-preset-governorate")).toBeTruthy();
        expect(screen.getByTestId("variant-add-wizard-preset-ab_test")).toBeTruthy();
    });

    it("picking the Holiday preset jumps to step 2 with date inputs", () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-preset-holiday"));
        // Step 2 with time_window kind
        const step = screen.getByTestId("variant-add-wizard-step");
        expect(step.getAttribute("data-step")).toBe("2");
        expect(screen.getByTestId("variant-wizard-time-window")).toBeTruthy();
        expect(
            (screen.getByTestId("variant-wizard-time-start") as HTMLInputElement).type,
        ).toBe("datetime-local");
    });

    it('renders the "Advanced — choose any rule" disclosure link', () => {
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        const toggle = screen.getByTestId("variant-add-wizard-advanced-toggle");
        expect(toggle).toBeTruthy();
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByTestId("variant-add-wizard-advanced-grid")).toBeTruthy();
    });

    it("picking the Mobile preset pre-selects breakpoint=mobile in step 2", () => {
        const onAdd = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={onAdd}
                existingVariantCount={0}
            />,
        );
        fireEvent.click(screen.getByTestId("variant-add-wizard-preset-mobile"));
        // Mobile checkbox is pre-checked; advance + submit yields breakpoint=[mobile]
        const mobileCheckbox = screen.getByTestId(
            "variant-wizard-breakpoint-mobile",
        ) as HTMLInputElement;
        expect(mobileCheckbox.checked).toBe(true);
        fireEvent.click(screen.getByTestId("variant-add-wizard-next"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        const v = onAdd.mock.calls[0][0];
        expect(v.conditions[0]).toEqual({ kind: "breakpoint", values: ["mobile"] });
    });

    it("Baghdad same-day preset is visible only when sectionType=delivery_promise", () => {
        const { unmount } = render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                sectionType="delivery_promise"
            />,
        );
        expect(
            screen.getByTestId("variant-add-wizard-preset-baghdad_same_day"),
        ).toBeTruthy();
        unmount();

        // Not shown on a different section type
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                sectionType="hero_image"
            />,
        );
        expect(
            screen.queryByTestId("variant-add-wizard-preset-baghdad_same_day"),
        ).toBeNull();
    });

    it("Ramadan preset is always visible (any section type, no section type)", () => {
        const { unmount } = render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        expect(screen.getByTestId("variant-add-wizard-preset-ramadan")).toBeTruthy();
        unmount();

        const { unmount: unmount2 } = render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                sectionType="delivery_promise"
            />,
        );
        expect(screen.getByTestId("variant-add-wizard-preset-ramadan")).toBeTruthy();
        unmount2();

        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                sectionType="hero_image"
            />,
        );
        expect(screen.getByTestId("variant-add-wizard-preset-ramadan")).toBeTruthy();
    });

    it("WhatsApp-first preset is visible only on hero_image / pdp_buy_box / cta_banner", () => {
        for (const sectionType of ["hero_image", "pdp_buy_box", "cta_banner"]) {
            const { unmount } = render(
                <VariantAddWizard
                    open
                    onClose={() => {}}
                    onAdd={() => {}}
                    existingVariantCount={0}
                    sectionType={sectionType}
                />,
            );
            expect(
                screen.getByTestId("variant-add-wizard-preset-whatsapp_first"),
            ).toBeTruthy();
            unmount();
        }

        // Not shown elsewhere
        const { unmount: unmount2 } = render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                sectionType="delivery_promise"
            />,
        );
        expect(
            screen.queryByTestId("variant-add-wizard-preset-whatsapp_first"),
        ).toBeNull();
        unmount2();

        // Not shown when sectionType is undefined either
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
            />,
        );
        expect(
            screen.queryByTestId("variant-add-wizard-preset-whatsapp_first"),
        ).toBeNull();
    });

    it("addConditionMode skips step 1 + step 3 and fires onAddCondition", () => {
        const onAddCondition = vi.fn();
        render(
            <VariantAddWizard
                open
                onClose={() => {}}
                onAdd={() => {}}
                existingVariantCount={0}
                addConditionMode={{
                    kind: "breakpoint",
                    onAddCondition,
                }}
            />,
        );
        // Step 2 is shown directly
        expect(screen.getByTestId("variant-wizard-breakpoint")).toBeTruthy();
        fireEvent.click(screen.getByTestId("variant-wizard-breakpoint-mobile"));
        fireEvent.click(screen.getByTestId("variant-add-wizard-submit"));
        expect(onAddCondition).toHaveBeenCalledWith({
            kind: "breakpoint",
            values: ["mobile"],
        });
    });
});
