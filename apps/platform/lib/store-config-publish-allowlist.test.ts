// Every config the platform builds must be one publish_store_config_v2 will
// accept. The RPC rejects any top-level key outside a hard-coded allowlist
// (22023 'store_config_v2 has unknown top-level keys'), while the draft
// seed has no allowlist at all — so a key the publish RPC does not know
// saves fine and only fails at the merchant's first Publish.
//
// The allowlist is read from the newest migration that defines the RPC, so
// adding a top-level key to StoreConfigV2 without the matching migration
// fails here instead of on a live store.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildStarterStoreConfigV2, STARTER_TEMPLATES } from "./starter-store";
import { applyTemplateUpgrade, planTemplateUpgrade } from "./store-templates/upgrade";
import { CONTENT_PACKS } from "./store-templates/content-packs";

const MIGRATIONS = path.resolve(__dirname, "../../../packages/supabase/migrations");

/** The `k NOT IN (...)` list of the newest migration that (re)defines the publish RPC. */
function publishAllowlist(): { file: string; keys: Set<string> } {
    const files = fs
        .readdirSync(MIGRATIONS)
        .filter((f) => /^\d{14}_.*\.sql$/.test(f))
        .sort();
    for (const file of [...files].reverse()) {
        const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
        if (!/CREATE OR REPLACE FUNCTION public\.publish_store_config_v2\s*\(/i.test(sql)) continue;
        const list = /jsonb_object_keys\(p_config\)\s+AS\s+k\s+WHERE\s+k\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(sql);
        if (!list) throw new Error(`${file} defines publish_store_config_v2 without a key allowlist`);
        const keys = new Set([...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
        return { file, keys };
    }
    throw new Error("no migration defines publish_store_config_v2");
}

function rejectedKeys(cfg: object, allowed: Set<string>): string[] {
    return Object.keys(cfg).filter((k) => !allowed.has(k));
}

describe("publish_store_config_v2 accepts what the platform builds", () => {
    const { file, keys } = publishAllowlist();

    it("reads the allowlist from the newest publish migration", () => {
        expect(keys.has("schema_version")).toBe(true);
        expect(keys.has("pages")).toBe(true);
        expect(file).toMatch(/^\d{14}_/);
    });

    it("accepts every stamped starter store: every direction × every pack", () => {
        for (const template of STARTER_TEMPLATES) {
            for (const pack of CONTENT_PACKS) {
                const cfg = buildStarterStoreConfigV2({
                    templateId: template.id,
                    packId: pack.id,
                    businessName: "متجر النخلة",
                });
                expect(cfg.template, `${template.id} × ${pack.id} is stamped`).toBeDefined();
                expect(rejectedKeys(cfg, keys), `${template.id} × ${pack.id} vs ${file}`).toEqual([]);
            }
        }
    });

    it("accepts a store after it takes a template update", () => {
        const cfg = buildStarterStoreConfigV2({ templateId: "scheniders_signature", packId: "coffee", businessName: "بن الرافدين" });
        const home = cfg.pages.find((p) => p.page_id === "home");
        if (!home) throw new Error("missing: home page");
        // Drop one section so the planner has an addition to offer.
        home.sections = home.sections.slice(1);
        const plan = planTemplateUpgrade(cfg);
        if (!plan) throw new Error("missing: upgrade plan for a stamped store");
        expect(plan.additions.length).toBeGreaterThan(0);
        const next = applyTemplateUpgrade(cfg, plan);
        expect(next.template?.version).toBe(plan.current_version);
        expect(rejectedKeys(next, keys), `upgraded config vs ${file}`).toEqual([]);
    });
});
