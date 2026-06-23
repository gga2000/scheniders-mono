/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LikelihoodMeter } from "./likelihood-meter";

afterEach(cleanup);

describe("LikelihoodMeter", () => {
  it("renders score, title and tier label", () => {
    render(<LikelihoodMeter score={67} title="احتمال التكرار" tierLabel="متوسط" />);
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("احتمال التكرار")).toBeTruthy();
    expect(screen.getByText("متوسط")).toBeTruthy();
  });

  it("exposes the tier as a data attribute for styling", () => {
    const { container } = render(
      <LikelihoodMeter score={85} title="t" tierLabel="مرتفع" />,
    );
    expect(container.querySelector('[data-tier="high"]')).toBeTruthy();
  });
});
