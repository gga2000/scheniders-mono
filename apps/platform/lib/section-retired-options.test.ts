import { describe, expect, it } from "vitest";
import { COUNTDOWN_MODES } from "@scheniders/sections/helpers/countdown";
import { offeredEnumOptions } from "./section-retired-options";
import { isFieldRelevant } from "./section-field-visibility";

describe("offeredEnumOptions", () => {
  it("offers only a fixed end for a new offer clock", () => {
    expect(offeredEnumOptions(COUNTDOWN_MODES, undefined)).toEqual(["fixed_end"]);
    expect(offeredEnumOptions(COUNTDOWN_MODES, "fixed_end")).toEqual(["fixed_end"]);
  });

  it("still shows a stored restarting clock as its current choice, so its owner can change it", () => {
    expect(offeredEnumOptions(COUNTDOWN_MODES, "evergreen_minutes")).toEqual(["fixed_end", "evergreen_minutes"]);
    expect(offeredEnumOptions(COUNTDOWN_MODES, "daily_reset")).toEqual(["daily_reset", "fixed_end"]);
  });

  it("leaves every other enum alone", () => {
    expect(offeredEnumOptions(["classic", "express"], undefined)).toEqual(["classic", "express"]);
  });
});

describe("offer clock fields", () => {
  const keys = ["label_i18n", "mode", "ends_at", "duration_minutes", "evergreen_clock"];
  it("asks for an end time only for a fixed end", () => {
    expect(isFieldRelevant("ends_at", { mode: "fixed_end" }, keys)).toBe(true);
    expect(isFieldRelevant("ends_at", { mode: "evergreen_minutes" }, keys)).toBe(false);
  });

  it("shows the loop length and its opt-in only on a stored loop", () => {
    expect(isFieldRelevant("duration_minutes", { mode: "fixed_end" }, keys)).toBe(false);
    expect(isFieldRelevant("evergreen_clock", { mode: "fixed_end" }, keys)).toBe(false);
    expect(isFieldRelevant("duration_minutes", { mode: "evergreen_minutes" }, keys)).toBe(true);
    expect(isFieldRelevant("evergreen_clock", { mode: "evergreen_minutes" }, keys)).toBe(true);
  });
});
