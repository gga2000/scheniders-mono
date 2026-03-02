"use client";

import { useEffect, useCallback, useRef, useState } from "react";

export interface AppLifecycleState {
  isVisible: boolean;
  isAppReopen: boolean; // True when app was closed and reopened
  lastVisibleAt: number | null;
  timeSinceLastVisible: number | null;
}

const STORAGE_KEY = "schneiders_last_visible_at";
const REOPEN_THRESHOLD_MS = 30000; // 30 seconds

export function useAppLifecycle(onAppReopen?: () => void) {
  const [state, setState] = useState<AppLifecycleState>({
    isVisible: true,
    isAppReopen: false,
    lastVisibleAt: null,
    timeSinceLastVisible: null,
  });

  const onAppReopenRef = useRef(onAppReopen);
  onAppReopenRef.current = onAppReopen;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load last visible timestamp from localStorage
    const loadLastVisibleAt = (): number | null => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? parseInt(stored, 10) : null;
      } catch {
        return null;
      }
    };

    // Save current timestamp to localStorage
    const saveLastVisibleAt = () => {
      try {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
      } catch {
        // Silently fail if localStorage is unavailable
      }
    };

    // Check if this is an app reopen
    const lastVisibleAt = loadLastVisibleAt();
    const now = Date.now();
    const timeSinceLastVisible = lastVisibleAt ? now - lastVisibleAt : null;
    const isAppReopen =
      timeSinceLastVisible !== null &&
      timeSinceLastVisible > REOPEN_THRESHOLD_MS;

    // Update state
    setState({
      isVisible: !document.hidden,
      isAppReopen,
      lastVisibleAt,
      timeSinceLastVisible,
    });

    // Trigger callback if app was reopened
    if (isAppReopen && onAppReopenRef.current) {
      console.log(
        `[AppLifecycle] App reopened after ${Math.round(timeSinceLastVisible! / 1000)}s`
      );
      onAppReopenRef.current();
    }

    // Save timestamp on initial mount
    saveLastVisibleAt();

    // Handle visibility changes
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;

      if (isVisible) {
        // App became visible
        const lastVisibleAt = loadLastVisibleAt();
        const now = Date.now();
        const timeSinceLastVisible = lastVisibleAt ? now - lastVisibleAt : null;
        const isAppReopen =
          timeSinceLastVisible !== null &&
          timeSinceLastVisible > REOPEN_THRESHOLD_MS;

        setState({
          isVisible: true,
          isAppReopen,
          lastVisibleAt,
          timeSinceLastVisible,
        });

        // Trigger callback if reopened
        if (isAppReopen && onAppReopenRef.current) {
          console.log(
            `[AppLifecycle] App reopened after ${Math.round(timeSinceLastVisible! / 1000)}s`
          );
          onAppReopenRef.current();
        }

        // Update timestamp
        saveLastVisibleAt();
      } else {
        // App became hidden - save timestamp
        saveLastVisibleAt();
        setState((prev) => ({
          ...prev,
          isVisible: false,
          isAppReopen: false,
        }));
      }
    };

    // Handle window focus (additional safety net)
    const handleFocus = () => {
      const lastVisibleAt = loadLastVisibleAt();
      const now = Date.now();
      const timeSinceLastVisible = lastVisibleAt ? now - lastVisibleAt : null;
      const isAppReopen =
        timeSinceLastVisible !== null &&
        timeSinceLastVisible > REOPEN_THRESHOLD_MS;

      if (isAppReopen && onAppReopenRef.current) {
        console.log(
          `[AppLifecycle] App focused after ${Math.round(timeSinceLastVisible! / 1000)}s`
        );
        onAppReopenRef.current();
      }

      saveLastVisibleAt();
    };

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return state;
}
