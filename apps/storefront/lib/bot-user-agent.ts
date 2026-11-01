/**
 * Crawlers, link-preview fetchers and uptime monitors that execute the page's
 * JavaScript and so fire the funnel beacon. They are not shoppers, and counted
 * as visitors they make the merchant's conversion rate look worse than it is.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|axios|node-fetch|go-http-client/i;

/** A request with no user agent at all is not a browser either. */
export function isLikelyBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}
