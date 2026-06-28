/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ColumnHeaderControls } from "./column-header-controls";

afterEach(cleanup);

const labels = { base: "الأساس", merge: "دمج", view: "عرض" };

describe("ColumnHeaderControls", () => {
  it("new-order column shows base label and no merge radio", () => {
    render(
      <ColumnHeaderControls
        isNew
        isMergeTarget={false}
        onPickTarget={() => {}}
        onView={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByText("الأساس")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /دمج/ })).toBeNull();
  });

  it("previous-order column fires callbacks", () => {
    const onPickTarget = vi.fn();
    const onView = vi.fn();
    render(
      <ColumnHeaderControls
        isNew={false}
        isMergeTarget={false}
        onPickTarget={onPickTarget}
        onView={onView}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /دمج/ }));
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    expect(onPickTarget).toHaveBeenCalledOnce();
    expect(onView).toHaveBeenCalledOnce();
  });

  it("marks the merge target via data attribute", () => {
    const { container } = render(
      <ColumnHeaderControls
        isNew={false}
        isMergeTarget
        onPickTarget={() => {}}
        onView={() => {}}
        labels={labels}
      />,
    );
    expect(container.querySelector('[data-merge-target="true"]')).toBeTruthy();
  });
});
