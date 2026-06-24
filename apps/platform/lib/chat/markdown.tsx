// apps/platform/lib/chat/markdown.tsx
// Hand-rolled, injection-safe markdown tokenizer.
// NEVER uses dangerouslySetInnerHTML — all input is passed as string children,
// so React escapes < > & automatically.
import React from "react";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Validate that a URL string is http: or https:. Returns the URL or null. */
function safeHref(raw: string): string | null {
    try {
        const u = new URL(raw);
        if (u.protocol === "http:" || u.protocol === "https:") return raw;
        return null;
    } catch {
        return null;
    }
}

// ─── inline tokenizer ───────────────────────────────────────────────────────

type InlineToken =
    | { kind: "text"; value: string }
    | { kind: "bold"; children: InlineToken[] }
    | { kind: "italic"; children: InlineToken[] }
    | { kind: "code"; value: string }
    | { kind: "strike"; children: InlineToken[] }
    | { kind: "link"; href: string; label: string }
    | { kind: "autolink"; href: string };

/**
 * Parse inline markdown within a single text segment.
 * The input is PLAIN TEXT (never HTML), so < > are already safe as literals.
 */
function parseInline(src: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    let i = 0;

    while (i < src.length) {
        // ── inline code `...` ──────────────────────────────────────────────
        if (src[i] === "`") {
            const end = src.indexOf("`", i + 1);
            if (end !== -1) {
                tokens.push({ kind: "code", value: src.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }

        // ── bold **...** ───────────────────────────────────────────────────
        if (src.startsWith("**", i)) {
            const end = src.indexOf("**", i + 2);
            if (end !== -1) {
                tokens.push({ kind: "bold", children: parseInline(src.slice(i + 2, end)) });
                i = end + 2;
                continue;
            }
        }

        // ── strikethrough ~~...~~ ──────────────────────────────────────────
        if (src.startsWith("~~", i)) {
            const end = src.indexOf("~~", i + 2);
            if (end !== -1) {
                tokens.push({ kind: "strike", children: parseInline(src.slice(i + 2, end)) });
                i = end + 2;
                continue;
            }
        }

        // ── italic *...* or _..._ ──────────────────────────────────────────
        if (src[i] === "*" || src[i] === "_") {
            const ch = src[i];
            const end = src.indexOf(ch, i + 1);
            if (end !== -1) {
                tokens.push({ kind: "italic", children: parseInline(src.slice(i + 1, end)) });
                i = end + 1;
                continue;
            }
        }

        // ── named link [text](url) ─────────────────────────────────────────
        if (src[i] === "[") {
            const closeBracket = src.indexOf("]", i + 1);
            if (closeBracket !== -1 && src[closeBracket + 1] === "(") {
                const closeParen = src.indexOf(")", closeBracket + 2);
                if (closeParen !== -1) {
                    const label = src.slice(i + 1, closeBracket);
                    const rawHref = src.slice(closeBracket + 2, closeParen);
                    const href = safeHref(rawHref);
                    if (href !== null) {
                        tokens.push({ kind: "link", href, label });
                    } else {
                        // Non-http scheme: render as plain text (no href)
                        tokens.push({ kind: "text", value: label });
                    }
                    i = closeParen + 1;
                    continue;
                }
            }
        }

        // ── bare autolink https?://... ─────────────────────────────────────
        if (src.startsWith("http://", i) || src.startsWith("https://", i)) {
            // Consume until whitespace or end
            let end = i;
            while (end < src.length && !/\s/.test(src[end])) end++;
            const rawHref = src.slice(i, end);
            const href = safeHref(rawHref);
            if (href !== null) {
                tokens.push({ kind: "autolink", href });
            } else {
                tokens.push({ kind: "text", value: rawHref });
            }
            i = end;
            continue;
        }

        // ── plain text (single character) ──────────────────────────────────
        const last = tokens[tokens.length - 1];
        if (last?.kind === "text") {
            last.value += src[i];
        } else {
            tokens.push({ kind: "text", value: src[i] });
        }
        i++;
    }

    return tokens;
}

function renderInline(tokens: InlineToken[], keyPrefix: string): React.ReactNode[] {
    return tokens.map((tok, idx) => {
        const key = `${keyPrefix}-${idx}`;
        switch (tok.kind) {
            case "text":
                return tok.value;
            case "bold":
                return <strong key={key}>{renderInline(tok.children, key)}</strong>;
            case "italic":
                return <em key={key}>{renderInline(tok.children, key)}</em>;
            case "code":
                return <code key={key}>{tok.value}</code>;
            case "strike":
                return <del key={key}>{renderInline(tok.children, key)}</del>;
            case "link":
                return (
                    <a key={key} href={tok.href} target="_blank" rel="noopener noreferrer">
                        {tok.label}
                    </a>
                );
            case "autolink":
                return (
                    <a key={key} href={tok.href} target="_blank" rel="noopener noreferrer">
                        {tok.href}
                    </a>
                );
        }
    });
}

// ─── block tokenizer ────────────────────────────────────────────────────────

type BlockToken =
    | { kind: "ul"; items: string[] }
    | { kind: "blockquote"; text: string }
    | { kind: "paragraph"; text: string };

function parseBlocks(src: string): BlockToken[] {
    const lines = src.split("\n");
    const blocks: BlockToken[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── unordered list ─────────────────────────────────────────────────
        if (/^[-*] /.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^[-*] /.test(lines[i])) {
                items.push(lines[i].slice(2));
                i++;
            }
            blocks.push({ kind: "ul", items });
            continue;
        }

        // ── blockquote ─────────────────────────────────────────────────────
        if (line.startsWith("> ")) {
            blocks.push({ kind: "blockquote", text: line.slice(2) });
            i++;
            continue;
        }

        // ── paragraph (skip blank lines) ───────────────────────────────────
        if (line.trim() !== "") {
            blocks.push({ kind: "paragraph", text: line });
        }
        i++;
    }

    return blocks;
}

// ─── public API ─────────────────────────────────────────────────────────────

export function renderMarkdown(src: string): React.ReactNode {
    const blocks = parseBlocks(src);

    return blocks.map((block, bi) => {
        const key = `b${bi}`;
        switch (block.kind) {
            case "ul":
                return (
                    <ul key={key}>
                        {block.items.map((item, ii) => (
                            <li key={ii}>{renderInline(parseInline(item), `${key}-li${ii}`)}</li>
                        ))}
                    </ul>
                );
            case "blockquote":
                return (
                    <blockquote key={key}>
                        {renderInline(parseInline(block.text), `${key}-bq`)}
                    </blockquote>
                );
            case "paragraph":
                return (
                    <span key={key}>
                        {renderInline(parseInline(block.text), `${key}-p`)}
                    </span>
                );
        }
    });
}
