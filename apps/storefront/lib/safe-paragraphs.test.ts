import { describe, expect, it } from "vitest";
import { htmlToSafeParagraphs } from "./safe-paragraphs";

describe("htmlToSafeParagraphs", () => {
  it("splits blocks and drops every tag", () => {
    expect(htmlToSafeParagraphs("<p>Hello <b>world</b></p><p>Two<br><br>Three</p>")).toEqual(["Hello world", "Two", "Three"]);
  });

  it("keeps script and handler payloads as inert text", () => {
    const out = htmlToSafeParagraphs('<img src=x onerror="alert(1)"><script>alert(2)</script>ok');
    expect(out.join(" ")).not.toMatch(/<|onerror/);
  });

  it("does not turn double-escaped entities back into tags", () => {
    expect(htmlToSafeParagraphs("&amp;lt;script&amp;gt;")).toEqual(["&lt;script&gt;"]);
  });

  it("returns nothing for empty input", () => {
    expect(htmlToSafeParagraphs(null)).toEqual([]);
  });
});
