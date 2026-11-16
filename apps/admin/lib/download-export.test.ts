import { describe, expect, it } from "vitest";
import { exportFileName } from "./download-export";

describe("exportFileName", () => {
  it("reads the name the server gives the file", () => {
    expect(exportFileName('attachment; filename="merchants_export_2026-11-16.csv"')).toBe("merchants_export_2026-11-16.csv");
  });

  it("has none when the header is missing or has no name", () => {
    expect(exportFileName(null)).toBeUndefined();
    expect(exportFileName("attachment")).toBeUndefined();
  });
});
