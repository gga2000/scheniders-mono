/**
 * Living page backdrop: a fine dot grid with a slow twinkle and two soft
 * colour drifts behind it. Pure CSS (styles in globals.css under
 * "Ambient backdrop"), so no JS runs per frame. Only `opacity` and `transform`
 * animate, which the browser composites on the GPU without repainting.
 *
 * It sits at the bottom of the app's stacking context (`-z-10` inside the
 * `isolate` root in DashboardLayout), so it is always behind cards, toolbars
 * and the header glass, never on top of them. Reduced motion: still dots only.
 */
export function AmbientBackdrop() {
    return (
        <div aria-hidden="true" className="ambient-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="ambient-backdrop__glow ambient-backdrop__glow--a" />
            <div className="ambient-backdrop__glow ambient-backdrop__glow--b" />
            <div className="ambient-backdrop__dots" />
            <div className="ambient-backdrop__twinkle ambient-backdrop__twinkle--a" />
            <div className="ambient-backdrop__twinkle ambient-backdrop__twinkle--b" />
        </div>
    );
}
