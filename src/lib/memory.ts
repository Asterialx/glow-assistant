/**
 * Long-term memory: the model marks a lasting fact about the user with a separate line
 * "Запомню: …" (or "Remembered: …"), and Glow saves it after the reply completes.
 */
export const MEMORY_CAPTURE_PROMPT = [
  "Long-term memory is on.",
  "When the user states a lasting fact about themselves (name, occupation, place of study or work, city, long-term goals, stable preferences for answers) or explicitly asks you to remember something, end your reply with one separate line per new fact, at most 3 lines:",
  "Запомню: <short fact about the user in the third person, in the user's language>",
  "Do not write such a line for details of the current task, for facts already listed under Known user facts, for guesses, or for sensitive data (health, passwords, money, document numbers) unless the user explicitly asks to remember it.",
  "If the user asks you to forget something, say that saved facts can be deleted in Settings → Memory. Never use the \"Запомню:\" line for anything else.",
].join("\n");

const MARKER = /^(?:запомню|remembered)\s*:\s*(.+)$/i;
const MAX_FACT = 300;

/** Lasting facts the assistant marked in its reply, at most `limit`. */
export function extractMemoryFacts(text: string, limit = 3): string[] {
  const facts: string[] = [];
  // Facts are written at the end of the reply, never inside code.
  const prose = text.replace(/```[\s\S]*?```/g, "");
  for (const raw of prose.split("\n")) {
    const line = raw.trim().replace(/^(?:>\s*)?(?:[-*•]\s+)?[*_]*\s*/, "").replace(/[*_]+\s*$/, "");
    const fact = line.match(MARKER)?.[1]?.replace(/^[*_\s]+/, "").trim();
    if (fact && fact.length <= MAX_FACT && !facts.some(known => sameFact(known, fact))) facts.push(fact);
    if (facts.length >= limit) break;
  }
  return facts;
}

export function normalizeFact(fact: string): string {
  return fact.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function sameFact(a: string, b: string): boolean {
  return normalizeFact(a) === normalizeFact(b);
}
