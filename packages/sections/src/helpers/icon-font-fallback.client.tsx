"use client";

// Loads the full icon font once, when an icon outside the shipped subset
// renders (see icon-names.ts). A second @font-face of the same family replaces
// the subset, so every icon draws; until it arrives the icon stays invisible
// (`display=block`) instead of showing its name as text.

import { useEffect } from "react";
import { ICON_FONT_FULL_HREF } from "./icon-names";

const LINK_ID = "bk-icon-font-full";

export function IconFontFallback() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = ICON_FONT_FULL_HREF;
    document.head.appendChild(link);
  }, []);
  return null;
}
