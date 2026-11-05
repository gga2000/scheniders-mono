/**
 * The till's feedback: a short beep for every scan or tap, and an item's photo
 * flying into the cart. Both run in the browser only and never block a sale.
 */

let audio: AudioContext | null = null;

function context(): AudioContext | null {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
    audio ??= new window.AudioContext();
    // Browsers start audio suspended until the first tap; every till action is one.
    if (audio.state === "suspended") void audio.resume();
    return audio;
}

/** One high blip for "added", two low ones for "not found". */
export function beep(kind: "ok" | "bad"): void {
    const ctx = context();
    if (!ctx) return;
    const tones = kind === "ok" ? [{ f: 1760, at: 0, len: 0.07 }] : [{ f: 330, at: 0, len: 0.12 }, { f: 262, at: 0.16, len: 0.16 }];
    for (const tone of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === "ok" ? "sine" : "square";
        osc.frequency.value = tone.f;
        const start = ctx.currentTime + tone.at;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === "ok" ? 0.18 : 0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + tone.len + 0.02);
    }
}

/** The cart's drop point; the cart panel marks it with this id. */
export const CART_TARGET_ID = "till-cart-target";

/** Sends a copy of the tapped photo into the cart. Skipped when the person asks for less motion. */
export function flyToCart(from: HTMLElement | null, imageUrl: string | null): void {
    if (!from || !imageUrl || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = document.getElementById(CART_TARGET_ID);
    if (!target) return;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const size = Math.min(a.width, a.height, 160);
    const ghost = document.createElement("img");
    ghost.src = imageUrl;
    ghost.alt = "";
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
        position: "fixed",
        left: `${a.left + (a.width - size) / 2}px`,
        top: `${a.top + (a.height - size) / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "cover",
        borderRadius: "20px",
        zIndex: "60",
        pointerEvents: "none",
        boxShadow: "0 12px 32px rgba(0,0,0,.18)",
    });
    document.body.appendChild(ghost);
    const dx = b.left + 24 - (a.left + (a.width - size) / 2);
    const dy = b.top + 24 - (a.top + (a.height - size) / 2);
    const end = 48 / size;
    const run = ghost.animate(
        [
            { transform: "translate(0,0) scale(1)", opacity: 1 },
            { transform: `translate(${dx * 0.6}px, ${dy * 0.35 - 40}px) scale(${(1 + end) / 2})`, opacity: 1, offset: 0.6 },
            { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.2 },
        ],
        { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    run.onfinish = () => ghost.remove();
    run.oncancel = () => ghost.remove();
}
