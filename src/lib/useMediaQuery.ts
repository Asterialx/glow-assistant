import { useEffect, useState } from "react";

/** True when viewport matches the query (SSR-safe default: false). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function detectPhoneUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
}

/**
 * Phone / mobile shell — narrow viewport layout (drawer sidebar, compact chrome).
 */
export function useIsMobile(): boolean {
  // Layout breakpoint only — avoid treating wide iPad landscape as "phone chrome".
  return useMediaQuery("(max-width: 767px)");
}

/** Sync helper for non-React code paths. */
export function isMobileShell(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

/** UA helper for mic / platform quirks (not layout). */
export function isPhoneUa(): boolean {
  return detectPhoneUa();
}
