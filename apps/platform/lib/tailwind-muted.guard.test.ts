import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Two different colours share the name "muted". The app's own `.text-muted`
 * class (globals.css) is grey text. Tailwind's `text-muted` utility, which is
 * what a variant (`placeholder:`, `hover:`) or an opacity (`/60`) produces,
 * reads `--color-muted`: the cream page background. So
 * `placeholder:text-muted` drew the /printing search hint at about 1.05:1
 * contrast, i.e. invisible. Grey text in those forms is `text-muted-foreground`.
 */

const BAD = /(?:[a-z-]+:text-muted|(?<![\w-])text-muted\/\d+)(?![\w-])/;

describe("muted text colour", () => {
    it("no variant or opacity form of text-muted (it resolves to the background colour)", () => {
        const root = join(__dirname, "..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "graphify-out") continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
                    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
                        if (BAD.test(line)) offenders.push(`${path.slice(root.length + 1)}:${i + 1}`);
                    });
                }
            }
        };
        for (const dir of ["app", "components"]) walk(join(root, dir));
        expect(offenders).toEqual([]);
    });
});
