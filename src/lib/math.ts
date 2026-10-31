/**
 * Models often write formulas as \( ... \) and \[ ... \], which remark-math does not read (it wants $ and $$).
 * Converts them, leaving code fences and inline code untouched.
 */
export function normalizeMath(markdown: string): string {
  if (!markdown.includes("\\(") && !markdown.includes("\\[")) return markdown;
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]+?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
    })
    .join("");
}
