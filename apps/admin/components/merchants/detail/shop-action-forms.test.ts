import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AddMoneyForm } from "./add-money-form";
import { FreeDaysForm } from "./free-days-form";
import { HoldForm } from "./hold-form";
import { PlanForm } from "./plan-form";

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
  it("says no monthly fee is charged, and waits for a reason before putting a shop on hold", () => {
    const html = render(createElement(HoldForm, { shopId: "t1", mode: "hold", comeback: "active", trialEndsAt: null, onDone: () => {} }));
    expect(html).toContain("No monthly fee is charged while it is on hold.");
    expect(html).toContain('aria-label="Reason"');
    expect(confirmButton(html)).toContain(">Put on hold<");
    expect(confirmButton(html)).toMatch(DISABLED);
  });

  it("brings a shop back without asking why", () => {
    const html = render(
      createElement(HoldForm, { shopId: "t1", mode: "reactivate", comeback: "active", trialEndsAt: null, onDone: () => {} }),
    );
    expect(html).toContain("The shop is active again now, and its monthly fee is charged as usual.");
    expect(html).not.toContain('aria-label="Reason"');
    expect(confirmButton(html)).not.toMatch(DISABLED);
  });

  it("says a held trial that was never paid comes back as a locked trial, not active", () => {
    const html = render(
      createElement(HoldForm, {
        shopId: "t1",
        mode: "reactivate",
        comeback: "trial",
        trialEndsAt: "2026-11-10T09:00:00Z",
        onDone: () => {},
      }),
    );
    expect(html).toContain("Its trial ended unpaid, so it stays locked until it pays.");
    expect(html).not.toContain("monthly fee is charged");
  });

  // Round 15: a paid shop whose last month was unpaid, then put on hold, was
  // told "active again now… charged as usual"; it comes back locked at once.
  it("says a held shop whose last month is unpaid comes back locked until its wallet covers the month", () => {
    const html = render(
      createElement(HoldForm, { shopId: "t1", mode: "reactivate", comeback: "active_unpaid", trialEndsAt: null, onDone: () => {} }),
    );
    expect(html).toContain("its last month is not paid, so it stays locked until its wallet covers the month.");
    expect(html).not.toContain("charged as usual");
  });
});

describe("Change plan", () => {
  it("asks why the plan changes, and waits for a choice and a reason", () => {
    const html = render(createElement(PlanForm, { shopId: "t1", plan: "starter", onDone: () => {} }));
    expect(html).toContain('aria-label="Reason"');
    expect(html).not.toContain(">Starter<");
    expect(confirmButton(html)).toMatch(DISABLED);
  });
});
