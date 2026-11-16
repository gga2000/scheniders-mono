import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AddMoneyForm } from "./add-money-form";
import { FreeDaysForm } from "./free-days-form";
import { HoldForm } from "./hold-form";

/*
 * Each shop action is a short form whose button says what will happen, so the
 * press is the confirm. Money and trial days wait for a reason.
 */

const render = (form: ReactElement) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, form));

/** The confirm button: the last button of the form. */
const confirmButton = (html: string) => html.slice(html.lastIndexOf("<button"));
/** The disabled attribute itself, not the "disabled:" style names. */
const DISABLED = /\sdisabled=""/;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("Add money", () => {
  it("shows the wallet now and waits for an amount and how the money came", () => {
    const html = render(createElement(AddMoneyForm, { shopId: "t1", balance: 4_000, onDone: () => {} }));
    expect(html).toContain("Wallet now 4,000 IQD");
    expect(html).toContain("How did it come?");
    expect(confirmButton(html)).toMatch(DISABLED);
    expect(confirmButton(html)).toContain(">Add money<");
  });
});

describe("Give free days", () => {
  it("gives a paying shop 30 days by default and says the new end and that nothing is charged", () => {
    const html = render(
      createElement(FreeDaysForm, { shopId: "t1", kind: "month", endsAt: "2026-11-19T09:00:00Z", locked: false, onDone: () => {} }),
    );
    expect(html).toContain("This month then ends Sat 19 Dec, 12:00.");
    expect(html).toContain("Nothing is charged; the next charge moves to that day.");
    expect(confirmButton(html)).not.toMatch(DISABLED);
    expect(confirmButton(html)).toContain(">Give 30 free days<");
  });

  it("waits for a reason before trial days, and says a locked trial opens again", () => {
    const html = render(
      createElement(FreeDaysForm, { shopId: "t1", kind: "trial", endsAt: "2026-11-15T09:00:00Z", locked: true, onDone: () => {} }),
    );
    // The trial ended yesterday, so the 7 days count from now.
    expect(html).toContain("The trial then ends Mon 23 Nov, 12:00.");
    expect(html).toContain("The shop opens again and stays on trial.");
    expect(confirmButton(html)).toMatch(DISABLED);
  });
});

describe("On hold", () => {
  it("says no monthly fee is charged before putting a shop on hold", () => {
    const html = render(createElement(HoldForm, { shopId: "t1", mode: "hold", onDone: () => {} }));
    expect(html).toContain("No monthly fee is charged while it is on hold.");
    expect(confirmButton(html)).toContain(">Put on hold<");
  });
});
