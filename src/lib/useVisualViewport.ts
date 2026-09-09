import { useEffect } from "react";

/**
 * Keep #root height equal to the visible viewport so iOS/Android keyboards
 * shrink the app instead of covering the input and last chat bubbles.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const root = document.documentElement;
    const app = document.getElementById("root");
    const vv = window.visualViewport;

    const sync = () => {
      const height = Math.round(vv?.height ?? window.innerHeight);
      const offsetTop = Math.round(vv?.offsetTop ?? 0);
      root.style.setProperty("--app-height", `${height}px`);
      if (app) {
        // iOS sometimes pans the layout viewport; pin the app to the visible top.
        app.style.transform = offsetTop ? `translateY(${offsetTop}px)` : "";
      }
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--app-height");
      if (app) app.style.transform = "";
    };
  }, []);
}
