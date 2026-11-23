// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRIAL_FILTERS, TRIAL_FILTER_LABEL, type TrialFilter } from "@/lib/trial-pipeline";
import { TrialFilterChips } from "./trial-filter-chips";

/* Console audit round 23: a chip at 0 could be pressed and showed an empty list. */
afterEach(cleanup);

function counts(filled: Partial<Record<TrialFilter, number>>): Record<TrialFilter, number> {
  return Object.fromEntries(TRIAL_FILTERS.map((filter) => [filter, filled[filter] ?? 0])) as Record<TrialFilter, number>;
}

const chip = (filter: TrialFilter) => screen.getByText(TRIAL_FILTER_LABEL[filter]).closest("button") as HTMLButtonElement;

describe("TrialFilterChips", () => {
  it("lets staff press only a chip with shops in it, All, or the one showing", () => {
    const onChange = vi.fn();
    const [, emptyGroup, fullGroup] = TRIAL_FILTERS;
    render(createElement(TrialFilterChips, { value: "not_called", counts: counts({ all: 1, [fullGroup]: 1 }), onChange }));
    expect(chip(emptyGroup).disabled).toBe(true);
    fireEvent.click(chip(emptyGroup));
    expect(onChange).not.toHaveBeenCalled();
    expect(chip(fullGroup).disabled).toBe(false);
    fireEvent.click(chip(fullGroup));
    expect(onChange).toHaveBeenCalledWith(fullGroup);
    // Showing, at 0: still marked and not greyed out.
    expect(chip("not_called").disabled).toBe(false);
    expect(chip("not_called").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps All pressable with no shop at all", () => {
    render(createElement(TrialFilterChips, { value: "not_called", counts: counts({}), onChange: vi.fn() }));
    expect(chip("all").disabled).toBe(false);
  });
});
