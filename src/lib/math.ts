/**
 * Prepares model markdown for remark-math, which runs with singleDollarTextMath off so that prices
 * like "$5 … $50" stay text. Every formula therefore ends up as $$…$$: inline when it sits inside a
 * line, a display block when it is on lines of its own.
 *
 * - \( … \) becomes inline $$…$$, \[ … \] a display block.
 * - Bare \begin{equation|align|gather|alignat} environments are wrapped in a display block.
 * - A single-dollar $…$ becomes inline math only by the Pandoc rule: no space right after the opening
 *   dollar, no space right before the closing one, and no digit right after it. "$5 и $50" fails it.
 *
 * Code fences, inline code and existing $$…$$ are left untouched.
 */
const PROTECTED = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|\$\$[\s\S]*?\$\$)/g;
const ENVIRONMENT = /\\begin\{(equation|align|gather|alignat)(\*?)\}[\s\S]*?\\end\{\1\2\}/g;
const SINGLE_DOLLAR = /(^|[^\\$\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?![\d$])/g;

/** Applies `transform` only to the parts of `markdown` outside code and existing $$…$$. */
function outside(markdown: string, transform: (text: string) => string): string {
  return markdown.split(PROTECTED).map((part, index) => (index % 2 === 1 ? part : transform(part))).join("");
}

const display = (body: string) => `\n$$\n${body.trim()}\n$$\n`;

export function normalizeMath(markdown: string): string {
  if (!/[\\$]/.test(markdown)) return markdown;
  let result = markdown;
  if (result.includes("\\[")) result = outside(result, (text) => text.replace(/\\\[([\s\S]+?)\\\]/g, (_match, body: string) => display(body)));
  if (result.includes("\\begin")) result = outside(result, (text) => text.replace(ENVIRONMENT, (match) => display(match)));
  if (result.includes("\\(")) result = outside(result, (text) => text.replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$$${body.trim()}$$`));
  if (result.includes("$")) result = outside(result, (text) => text.replace(SINGLE_DOLLAR, (_match, before: string, body: string) => `${before}$$${body}$$`));
  return result;
}
