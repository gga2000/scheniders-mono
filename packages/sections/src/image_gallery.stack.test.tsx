// @vitest-environment jsdom
// =====================================================================
// image_gallery stack — the expand/collapse island
// =====================================================================
// The rest of the comments start hidden; one tap shows them in place and
// relabels the same button «سدّ التعليقات»; a second tap hides them again.
// The button names the list it controls.
// =====================================================================

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ProofStackMore } from "./image_gallery.stack";

afterEach(cleanup);

function setup() {
  return render(
    <ProofStackMore listId="proof-rest" moreLabel="شوف 6 تعليقات ثانية" lessLabel="سدّ التعليقات" rtl>
      <li>عباس</li>
      <li>Alpha decorations company</li>
    </ProofStackMore>,
  );
}

describe("ProofStackMore", () => {
  it("starts closed: the list hidden, the button says how many are behind it", () => {
    const { getByRole, container } = setup();
    const list = container.querySelector("#proof-rest");
    expect(list?.hasAttribute("hidden")).toBe(true);
    const button = getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("proof-rest");
    expect(button.textContent).toContain("شوف 6 تعليقات ثانية");
  });

  it("a tap opens the rest in place; a second tap closes it", () => {
    const { getByRole, container } = setup();
    const button = getByRole("button");
    fireEvent.click(button);
    expect(container.querySelector("#proof-rest")?.hasAttribute("hidden")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toContain("سدّ التعليقات");
    fireEvent.click(button);
    expect(container.querySelector("#proof-rest")?.hasAttribute("hidden")).toBe(true);
    expect(button.textContent).toContain("شوف 6 تعليقات ثانية");
  });

  it("flips its row for Arabic with a class, never dir", () => {
    const { getByRole, container } = setup();
    expect(getByRole("button").className).toContain("flex-row-reverse");
    expect(container.querySelector("[dir]")).toBeNull();
  });
});
