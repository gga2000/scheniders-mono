// =====================================================================
// /_preview layout
// =====================================================================
// The preview route is meant to be loaded inside the platform editor's
// iframe. We deliberately strip out the storefront's normal nav / footer
// chrome so the editor can paint its own overlays cleanly on top of just
// the page content. The root layout in `app/layout.tsx` still wraps us
// (one <html> tag is mandatory in Next), but this segment renders no
// extra shell — it's a passthrough.
// =====================================================================

import type { ReactNode } from "react";

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
