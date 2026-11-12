// Sentry tunnel (tunnelRoute in next.config.ts): forwards only the event
// payload to Sentry, never the merchant's cookies or headers.
export { POST } from "@sentry/nextjs/tunnel";
