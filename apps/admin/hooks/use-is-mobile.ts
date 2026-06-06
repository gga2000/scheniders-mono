"use client";

import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

/** True when the viewport is narrower than 768px. Returns `false` until mounted. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}
