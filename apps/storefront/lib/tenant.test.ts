import { describe, it, expect } from "vitest";
import { PUBLIC_TENANT_COLS, PREVIEW_TENANT_COLS } from "./tenant";

describe("tenant column sets", () => {
  it("public select never includes the draft column", () => {
    expect(PUBLIC_TENANT_COLS).not.toContain("store_config_v2_draft");
    expect(PUBLIC_TENANT_COLS).toContain("store_config_v2");
  });
  it("preview select includes the draft column", () => {
    expect(PREVIEW_TENANT_COLS).toContain("store_config_v2_draft");
  });
});
