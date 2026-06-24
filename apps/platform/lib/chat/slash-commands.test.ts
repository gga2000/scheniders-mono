// apps/platform/lib/chat/slash-commands.test.ts
import { describe, it, expect } from "vitest";
import { parseSlash, slashCommandsFor } from "./slash-commands";

describe("slash commands", () => {
    it("parses /cmd arg from the start of input only", () => {
        expect(parseSlash("/order 1234")).toEqual({ name: "order", arg: "1234" });
        expect(parseSlash("hello /order")).toBeNull();
        expect(parseSlash("/")).toEqual({ name: "", arg: "" });
    });
    it("order commands are only available in order threads", () => {
        const channel = slashCommandsFor("channel").map((c) => c.name);
        const order = slashCommandsFor("order").map((c) => c.name);
        expect(order).toContain("assign");
        expect(order).toContain("status");
        expect(channel).not.toContain("assign");
        expect(channel).not.toContain("status");
    });
    it("shrug is available everywhere", () => {
        expect(slashCommandsFor("channel").map((c) => c.name)).toContain("shrug");
    });
});
