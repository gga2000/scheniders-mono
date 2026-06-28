// apps/platform/lib/chat/slash-commands.ts
// Pure registry — no side-effects. Side-effects are wired in the composer (Task 5).
import type { ConversationKind } from "@/types/chat";

// ─── types ───────────────────────────────────────────────────────────────────

/** Discriminated action tag — side-effects resolved by the composer, not here. */
export type SlashAction =
    | { type: "insert"; text: string }
    | { type: "reference" }
    | { type: "assign" }
    | { type: "status" };

export interface SlashCommand {
    name: string;
    /** i18n key for the label / description shown in the slash menu */
    descriptionKey: string;
    action: SlashAction;
    /** If set, this command is only available for conversations of these kinds. */
    kinds?: ConversationKind[];
}

// ─── parse ───────────────────────────────────────────────────────────────────

/**
 * Returns `{ name, arg }` when `input` begins with `/`, otherwise `null`.
 * Mid-string `/` is ignored.
 *
 * `/order 1234` → `{ name: "order", arg: "1234" }`
 * `/`            → `{ name: "",      arg: ""      }`
 * `hello /order` → `null`
 */
export function parseSlash(input: string): { name: string; arg: string } | null {
    if (!input.startsWith("/")) return null;
    const rest = input.slice(1);
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
        return { name: rest, arg: "" };
    }
    return { name: rest.slice(0, spaceIdx), arg: rest.slice(spaceIdx + 1).trim() };
}

// ─── registry ────────────────────────────────────────────────────────────────

const COMMANDS: SlashCommand[] = [
    {
        name: "shrug",
        descriptionKey: "chat.slash.shrug",
        action: { type: "insert", text: String.raw`¯\_(ツ)_/¯` },
        // no `kinds` → available in all conversation kinds
    },
    {
        name: "order",
        descriptionKey: "chat.slash.order",
        action: { type: "reference" },
        // no `kinds` → available in all conversation kinds
    },
    {
        name: "assign",
        descriptionKey: "chat.slash.assign",
        action: { type: "assign" },
        kinds: ["order"],
    },
    {
        name: "status",
        descriptionKey: "chat.slash.status",
        action: { type: "status" },
        kinds: ["order"],
    },
];

/**
 * Returns the slash commands available for a given conversation kind.
 * Commands without `kinds` are available everywhere; commands with `kinds`
 * are filtered to those that include the given kind.
 */
export function slashCommandsFor(kind: ConversationKind): SlashCommand[] {
    return COMMANDS.filter(
        (cmd) => cmd.kinds === undefined || cmd.kinds.includes(kind),
    );
}
