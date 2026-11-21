import { pixelPhoneDigits } from "@scheniders/shared";

/**
 * Fermi's own Meta Pixel (dataset "Fermi - usefermi.com"), the same one the
 * usefermi.com landing and /features pages load. Only the sign-up page loads
 * it: merchants' dashboards are never tracked. Meta's one-click Conversions
 * API gateway copies every browser event server-side, so no server sender or
 * access token is needed here.
 */
export const FERMI_META_PIXEL_ID = "3224251964631306";

/** sessionStorage key prefix: the landing hand-over Lead was sent for this number in this tab. */
export const LANDING_LEAD_SENT_KEY = "fermi:landing-lead:";

/**
 * The sign-up page's inline pixel script: the base code, the PageView, and
 * the landing hand-over Lead. The landing page's sign-up sheet sends the
 * owner here with their WhatsApp number in `?phone=`; that hand-over is the
 * Lead. It is sent from this page, not the landing page, because a request
 * fired as the landing page navigates away can be cancelled. Once per number
 * per tab, so a reload does not count it twice.
 */
export const FERMI_SIGNUP_PIXEL_JS = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${FERMI_META_PIXEL_ID}');fbq('track','PageView');
(function(){var q=new URLSearchParams(location.search),p=(q.get('phone')||'').replace(/\\D/g,'');
if(!/^07\\d{9}$/.test(p))return;var k='${LANDING_LEAD_SENT_KEY}'+p;
try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){/* storage blocked: still send the Lead */}
fbq('set','userData',{ph:'964'+p.slice(1),country:'iq'});
fbq('track','Lead',{content_name:'fermi_trial',content_category:q.get('type')||''})})();`;

type Fbq = (...args: unknown[]) => void;

function getFbq(): Fbq | undefined {
    const f = (globalThis as { fbq?: unknown }).fbq;
    return typeof f === "function" ? (f as Fbq) : undefined;
}

/**
 * A new merchant account was created. Sends Meta's standard
 * CompleteRegistration with the owner's email and phone as advanced matching
 * (fbevents hashes them in the browser before anything leaves the page).
 * The account starts on the free trial, so the event names it.
 */
export function trackSignupComplete(owner: { email: string; phone?: string | null; sells: readonly string[] }): void {
    const fbq = getFbq();
    if (!fbq) return;
    const userData: Record<string, string> = { em: owner.email.trim().toLowerCase(), country: "iq" };
    const ph = pixelPhoneDigits(owner.phone);
    if (ph) userData.ph = ph;
    fbq("set", "userData", userData);
    fbq("track", "CompleteRegistration", {
        content_name: "fermi_trial",
        content_category: owner.sells.join(","),
        status: true,
    });
}
