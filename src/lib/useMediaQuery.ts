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
 * Phone / mobile shell — hides desktop-only chrome (MCP, Chrome agent, Game Mode, etc.).
 * True for narrow viewports OR real phone/tablet UA (incl. Tauri iOS).
 */
export function useIsMobile(): boolean {
  const narrow = useMediaQuery("(max-width: 767px)");
  const [uaPhone] = useState(detectPhoneUa);
  return narrow || uaPhone;
}

/** Sync helper for non-React code paths. */
export function isMobileShell(): boolean {
  if (typeof window === "undefined") return false;
  return detectPhoneUa() || window.matchMedia("(max-width: 767px)").matches;
}
