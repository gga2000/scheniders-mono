import { describe, expect, it } from "vitest";
import { isTransientDbError } from "./transient-db-error";

describe("isTransientDbError", () => {
  it("is false when there is no error", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });

  it("treats an error that never reached Postgres (no code) as transient", () => {
    expect(isTransientDbError({ code: "" })).toBe(true);
    expect(isTransientDbError({})).toBe(true);
  });

  it.each(["08006", "40001", "40P01", "53300", "57014", "PGRST000", "PGRST003"])(
    "treats %s as transient",
    (code) => {
      expect(isTransientDbError({ code })).toBe(true);
    },
  );

  it.each(["22P02", "23505", "23514", "42501", "42883", "P0001", "PGRST116", "PGRST202"])(
    "treats %s as permanent",
    (code) => {
      expect(isTransientDbError({ code })).toBe(false);
    },
  );
});
