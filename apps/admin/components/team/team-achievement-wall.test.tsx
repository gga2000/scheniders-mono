import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, type AdminEmployee } from "@/types/leads";
import { TeamAchievementWall } from "./team-achievement-wall";

/*
 * Round 17 (C-06): the Achievement Wall drew a trophy, a rocket and ten more
 * emoji, where the console uses icons only. Each achievement shows the Lucide
 * icon its definition names, and nothing in the console writes an emoji.
 */

const PICTOGRAPH = new RegExp("\\p{Extended_Pictographic}", "u");
/** Emoji written as escapes in source ("🏆"), which only become emoji on screen. */
const EMOJI_ESCAPE = /\\u(?:D83[C-E][0-9A-F]{2}|26[0-9A-F]{2}|27[0-9A-F]{2}|2B50)/i;

const everyBadge: AdminEmployee = {
  id: "e1",
  email: "staff@example.com",
  display_name: "Staff member",
  avatar_url: null,
  role: "sales",
  is_active: true,
  last_login_at: null,
  leads_added: 60,
  leads_converted: 6,
  stores_built: 10,
  total_actions: 200,
  commission_earned: 0,
  commission_pending: 0,
  achievements: ACHIEVEMENTS.map((a) => a.key),
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("the Achievement Wall", () => {
  it("draws every unlocked achievement as its icon, never an emoji", () => {
    const html = renderToStaticMarkup(createElement(TeamAchievementWall, { employees: [everyBadge] }));
    expect(html).not.toMatch(PICTOGRAPH);
    for (const ach of ACHIEVEMENTS) {
      expect(html).toContain(`aria-label="${ach.name}"`);
    }
    expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(ACHIEVEMENTS.length);
  });
});

describe("the console", () => {
  it("writes no emoji anywhere, as a character or as an escape", () => {
    const root = join(__dirname, "..", "..");
    const found = ["app", "components", "hooks", "lib", "types"]
      .flatMap((dir) => sources(join(root, dir)))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return PICTOGRAPH.test(text) || EMOJI_ESCAPE.test(text);
      })
      .map((file) => file.slice(root.length + 1));
    expect(found).toEqual([]);
  });
});
