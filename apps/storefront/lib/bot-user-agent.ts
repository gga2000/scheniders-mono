/**
 * Crawlers, link-preview fetchers and scripted clients that execute the page's
 * JavaScript and so fire the funnel beacon. They are not shoppers, and counted
 * as visitors they make the merchant's conversion rate look worse than it is.
 *
 * Tokens are matched narrowly on purpose: a bare "bot" substring also matches
 * real handsets (Cubot) and a bare "preview"/"monitor" matches in-app
 * browsers, which would silently drop real Iraqi shoppers from the funnel.
 */
const BOT_UA =
  /\b\w*bot\/[\d.]+|\bbot\b|crawl|spider|slurp|headlesschrome|lighthouse|pingdom|facebookexternalhit|facebot|python-requests|\bcurl\/|\bwget\/|go-http-client|node-fetch|\baxios\//i;

/** A request with no user agent at all is not a browser either. */
export function isLikelyBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}
