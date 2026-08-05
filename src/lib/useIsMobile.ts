import { useEffect, useState } from "react";

/** Tailwind `md` breakpoint — treat below as phone / narrow tablet. */
export const MOBILE_MAX_PX = 767;

export function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_PX}px)`).matches;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(getIsMobile);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_PX}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
