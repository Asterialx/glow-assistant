/** Design-mode helpers: phone vs desktop preview detection. */

export type DesignFrame = "phone" | "desktop";

const PHONE_HINT =
  /\b(app|mobile|ios|android|iphone|телефон|мобильн|приложени|ui kit|screen|экраны|экрана)\b/i;

export function detectDesignFrame(html: string, userHint = ""): DesignFrame {
  const blob = `${userHint}\n${html.slice(0, 4000)}`;
  if (PHONE_HINT.test(blob)) return "phone";
  // Compact layouts often mean mobile
  if (/max-width:\s*(3[2-9]\d|4[0-3]\d)px/i.test(html) && /viewport/i.test(html)) {
    return "phone";
  }
  return "desktop";
}

export const DESIGN_MODE_SYSTEM = [
  "DESIGN MODE IS ON — you are a product/UI designer + front-end implementer, not a chatty essay writer.",
  "Mindset: visual hierarchy, typography, spacing, brand, one clear CTA, real clickable UI.",
  "Chat replies MUST be short (1–3 sentences max). No long explanations, no fluff, no markdown essays.",
  "ALWAYS ship a complete self-contained page in ONE ```html fence (inline CSS + minimal JS). The app shows it live in Artifacts.",
  "Include <!DOCTYPE html>, charset, viewport meta, and polished CSS. Prefer full-bleed layouts; avoid generic purple AI aesthetics.",
  "For websites/landing: desktop-ready responsive HTML.",
  "For apps / mobile / телефон / приложение: design as a mobile screen (max-width ~390px, centered) so it fits a phone preview frame.",
  "After the fence: one short line like «Готово — смотри превью справа.» Do not paste the source in prose.",
  "Iterate: when user asks to change something, rewrite the FULL html block (not a diff).",
].join(" ");
