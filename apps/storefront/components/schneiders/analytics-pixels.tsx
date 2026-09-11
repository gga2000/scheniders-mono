import Script from "next/script";
import type { AnalyticsConfig } from "@scheniders/shared";
import { PixelRouteChange } from "./pixel-route-change";

/**
 * Injects Meta / TikTok / Google Analytics / Snapchat / GTM pixels.
 *
 * Server-rendered (no client JS bundle bloat). Scripts use Next.js `<Script>`
 * so they load with `afterInteractive` strategy — non-blocking but available
 * before user-driven events fire.
 *
 * If `gtm_container_id` is set, individual pixels are skipped (the merchant
 * is presumed to be loading them through Tag Manager instead).
 *
 * The inline scripts fire the first PageView on document load; the small
 * `PixelRouteChange` client island re-fires it on App Router navigations
 * (P2-29) and is only mounted when a direct pixel is actually configured.
 */
/**
 * Rejects empty, placeholder, and malformed pixel IDs so a misconfigured
 * tenant never ships a live-but-broken pixel (e.g. the seed placeholder
 * `CABCDEF`, which fires real requests and logs "Invalid pixel ID"). Rules
 * are lenient — they only catch obvious junk, never a plausibly-real ID.
 */
function isPlausiblePixelId(
  provider: "meta" | "tiktok" | "ga" | "snap" | "gtm",
  raw: string,
): boolean {
  const v = raw.trim();
  if (v.length < 6) return false;
  if (/^(x+|0+|test|demo|your|sample|placeholder|change[-_ ]?me|abc(def)?|cabcdef)$/i.test(v))
    return false;
  switch (provider) {
    case "meta":
      return /^\d{10,}$/.test(v); // 15–16 digit numeric pixel id
    case "tiktok":
      return /^[A-Z0-9]{12,}$/i.test(v); // ~20-char alnum (CABCDEF = 7 → rejected)
    case "ga":
      return /^(G-[A-Z0-9]{6,}|UA-\d{4,}-\d+|AW-\d{6,})$/i.test(v);
    case "snap":
      return v.length >= 12;
    case "gtm":
      return /^GTM-[A-Z0-9]{5,}$/i.test(v);
    default:
      return true;
  }
}

export function SchneidersAnalyticsPixels({ analytics }: { analytics?: AnalyticsConfig | null }) {
  if (!analytics) return null;
  const gtmRaw = analytics.gtm_container_id?.trim();
  const gtm = gtmRaw && isPlausiblePixelId("gtm", gtmRaw) ? gtmRaw : undefined;
  if (gtm) {
    return (
      <>
        {/* Google Tag Manager (head) */}
        <Script
          id="gtm-head"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${escapeJs(gtm)}');`,
          }}
        />
        {/* GTM noscript fallback */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtm)}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      </>
    );
  }

  const metaRaw = analytics.meta_pixel_id?.trim();
  const tiktokRaw = analytics.tiktok_pixel_id?.trim();
  const gaRaw = analytics.google_analytics_id?.trim();
  const snapRaw = analytics.snapchat_pixel_id?.trim();
  const meta = metaRaw && isPlausiblePixelId("meta", metaRaw) ? metaRaw : undefined;
  // A store can run several TikTok pixels at once (common when an agency
  // pixel coexists with the merchant's own): the field accepts a comma /
  // whitespace separated list, each id validated independently.
  const tiktokIds = (tiktokRaw ?? "")
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => v && isPlausiblePixelId("tiktok", v));
  const ga = gaRaw && isPlausiblePixelId("ga", gaRaw) ? gaRaw : undefined;
  const snap = snapRaw && isPlausiblePixelId("snap", snapRaw) ? snapRaw : undefined;
  // GA4's own enhanced measurement already tracks history changes, so the
  // route-change island only serves the pixels whose SDKs don't.
  const needsRouteChangePageView = Boolean(meta) || tiktokIds.length > 0 || Boolean(snap);

  return (
    <>
      {needsRouteChangePageView && <PixelRouteChange />}
      {meta && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${escapeJs(meta)}');
fbq('track', 'PageView');`,
          }}
        />
      )}

      {tiktokIds.length > 0 && (
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
${tiktokIds.map((id) => `ttq.load('${escapeJs(id)}');`).join("\n")}
ttq.page();
}(window, document, 'ttq');`,
          }}
        />
      )}

      {ga && (
        <>
          <Script
            id="ga4-loader"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`}
          />
          <Script
            id="ga4-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${escapeJs(ga)}');`,
            }}
          />
        </>
      )}

      {snap && (
        <Script
          id="snapchat-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');
snaptr('init', '${escapeJs(snap)}');
snaptr('track', 'PAGE_VIEW');`,
          }}
        />
      )}
    </>
  );
}

/** Minimal JS-string escaper for inline-script tag IDs. Pixel IDs are
 *  short alphanumeric strings in practice; this is belt-and-braces. */
function escapeJs(s: string): string {
  return s.replace(/[\\'"<]/g, (c) => "\\" + c);
}
