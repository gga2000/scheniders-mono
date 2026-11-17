// Home's Recent Activity printed the log's raw key ("export_data"). It now
// says the step in the same plain words as the Team page and the Activity log.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityFeed } from "./activity-feed";

const row = (action: string, details: Record<string, unknown> | null = null) => ({
  id: action,
  action,
  details,
  tenant_id: null,
  created_at: "2026-11-16T09:00:00Z",
  admin_user_id: null,
  admin_label: null,
  actor_email: null,
});

describe("Recent Activity", () => {
  it("says each step in plain words, never the raw key", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityFeed, {
        activities: [row("export_data"), row("extend_trial", { days: 7 }), row("support_case_solved")],
      }),
    );
    expect(html).toContain("Downloaded a list");
    expect(html).toContain("Gave 7 free trial days");
    expect(html).toContain("Support question solved");
    expect(html).not.toMatch(/>[a-z]+(_[a-z]+)+</);
  });
});
