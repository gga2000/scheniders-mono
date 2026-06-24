// apps/platform/lib/chat/markdown.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "./markdown";

const html = (s: string) => renderToStaticMarkup(<>{renderMarkdown(s)}</>);

describe("renderMarkdown", () => {
    it("renders bold + italic + inline code", () => {
        expect(html("**b** *i* `c`")).toContain("<strong>b</strong>");
        expect(html("**b** *i* `c`")).toContain("<em>i</em>");
        expect(html("**b** *i* `c`")).toContain("<code");
    });
    it("renders strikethrough", () => {
        expect(html("~~x~~")).toMatch(/<(del|s)[ >]/);
    });
    it("linkifies bare URLs + [text](url), and escapes the href scheme to http/https only", () => {
        expect(html("see https://a.test")).toContain('href="https://a.test"');
        expect(html("[t](https://b.test)")).toContain('href="https://b.test"');
        // javascript: scheme must NOT become an href
        expect(html("[x](javascript:alert(1))")).not.toContain("javascript:");
    });
    it("does NOT emit raw HTML from the input (injection-safe)", () => {
        const out = html("<img src=x onerror=alert(1)>");
        expect(out).not.toContain("<img");
        expect(out).toContain("&lt;img"); // rendered as text
    });
    it("renders unordered list items", () => {
        expect(html("- a\n- b")).toContain("<li>a</li>");
    });
    it("renders blockquote", () => {
        expect(html("> q")).toContain("<blockquote");
    });
});
