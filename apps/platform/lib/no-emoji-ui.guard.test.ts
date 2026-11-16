import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * The app's screens use icons, never emoji (owner's rule): emoji draw
 * differently on every phone and laptop and read as unfinished. This covers
 * the screens and the dictionaries. Text messages the app sends (WhatsApp,
 * Telegram, the share-order text) are not screens and are not checked.
 */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{23F0}-\u{23FA}\u{231A}\u{231B}]/u;
// Plain text marks that render as type, not pictures.
const TEXT_MARKS = /[✓✔✕✗✘★☆]/gu;

const ALLOWED = new Set([
    // Chat lets people send emoji; these are the picker and the quick reactions.
    "components/chat/emoji-picker.tsx",
    "components/chat/reaction-bar.tsx",
    // Strips an emoji prefix that older saved risk notes carry.
    "components/orders/risk-badge.tsx",
]);

describe("no emoji on screens", () => {
    it("screens and dictionaries use icons instead of emoji", () => {
        const root = join(__dirname, "..");
        const offenders: string[] = [];
        const check = (path: string) => {
            const rel = path.slice(root.length + 1);
            if (ALLOWED.has(rel)) return;
            readFileSync(path, "utf8").split("\n").forEach((line, i) => {
                if (EMOJI.test(line.replace(TEXT_MARKS, ""))) offenders.push(`${rel}:${i + 1}`);
            });
        };
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "api") continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) check(path);
            }
        };
        for (const dir of ["app", "components"]) walk(join(root, dir));
        for (const name of readdirSync(join(root, "lib"))) {
            if (/^i18n-.*\.ts$/.test(name) && !/\.test\.ts$/.test(name)) check(join(root, "lib", name));
        }
        expect(offenders).toEqual([]);
    });
});
