"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { scrubAnalyticsUrl } from "@scheniders/shared/analytics-url";

function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: scrubAnalyticsUrl(event.url) };
}

/** Vercel Web Analytics page views, with credential query values stripped. */
export function WebAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
