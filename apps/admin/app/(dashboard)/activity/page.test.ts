import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

/*
 * Round 23 (UX new 2): the log reads again when staff come back to the tab,
 * and a failed read kept the last rows with nothing to say they may be old.
 */

const { default: ActivityLogPage } = await import("./page");

const LOG = {
  id: "log-1",
  action: "tenant_paused",
  details: null,
  tenant_id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  admin_user_id: null,
  admin_label: "Karrar",
  actor_email: null,
  created_at: "2026-11-22T16:00:00Z",
  business_name: "Kut Perfumes",
};

function render(refreshFailed: boolean): string {
  const client = new QueryClient();
  const queryKey = ["admin", "activity", 1, null];
  client.setQueryData(queryKey, { logs: [LOG], total: 1, page: 1, limit: 50 });
  if (refreshFailed) {
    // Read at 20:00 in Baghdad, then the read on coming back failed.
    client.getQueryCache().find({ queryKey })?.setState({
      status: "error",
      error: new TypeError("Failed to fetch"),
      dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    });
  }
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ActivityLogPage)));
}

describe("Activity log after a failed read again", () => {
  it("keeps the rows and says how old the list is", () => {
    const html = render(true);
    expect(html).toMatch(/Could not refresh the activity log\. This list is from (Sun 22 Nov, )?20:00\./);
    expect(html).toContain("Kut Perfumes");
    expect(html).toContain("1 log entry");
  });

  it("says nothing extra after a good read", () => {
    expect(render(false)).not.toContain("Could not refresh");
  });
});
