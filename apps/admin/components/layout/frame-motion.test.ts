import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The frame shows on every page. Its animations use `m` under AdminShell's
// LazyMotion, so the animation engine (about 30 KB compressed) loads after the
// page instead of before it. One `motion` import in the frame would put the
// whole engine back in front of every page.
const FRAME_FILES = [
  "components/layout/admin-shell.tsx",
  "components/layout/admin-sidebar.tsx",
  "components/layout/admin-topbar.tsx",
  "components/shared/notification-bell.tsx",
  "components/shared/command-palette.tsx",
];

describe("the console frame's animations", () => {
  it.each(FRAME_FILES)("%s does not import the full motion component", (file) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']framer-motion["']/g)]
      .flatMap((match) => match[1].split(",").map((name) => name.trim()));
    expect(imports).not.toContain("motion");
  });

  it("AdminShell loads the animation features after the page", () => {
    const shell = fs.readFileSync(path.resolve(__dirname, "admin-shell.tsx"), "utf8");
    expect(shell).toMatch(/<LazyMotion features=\{loadMotionFeatures\}>/);
    expect(shell).toMatch(/import\("@\/lib\/motion-features"\)/);
  });
});
