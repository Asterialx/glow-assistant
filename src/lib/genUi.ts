/** Validated, model-produced UI blocks. Executable markup is deliberately not accepted here. */
import type { Artifact, Message } from "./types";
import { validateStudyPlan, type StudyPlanBlock } from "./studyPlan.ts";
export interface CalculatorField {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  control: "number" | "range";
}

export interface QuestionnaireQuestion {
  id: string;
  prompt: string;
  mode: "single" | "multiple" | "text";
  options?: string[];
  required: boolean;
}

type FormulaNode =
  | { type: "call"; name: string; args: FormulaNode[] }
  | { type: "number"; value: number }
  | { type: "field"; id: string }
  | { type: "unary"; operator: "+" | "-"; operand: FormulaNode }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: FormulaNode; right: FormulaNode };

export interface DiagramBlock {
  type: "diagram";
  title: string;
  fields: CalculatorField[];
  points: Array<{ id: string; label?: string; x: string; y: string }>;
  lines: Array<{ from: string; to: string; accent: boolean }>;
  outputs: Array<{ label: string; formula: string; unit?: string }>;
  precision: number;
  note?: string;
}

export type GenUiBlock =
  | StudyPlanBlock
  | DiagramBlock
  | {
      type: "table";
      title: string;
      columns: string[];
      rows: string[][];
      note?: string;
    }
  | {
      type: "chart";
      title: string;
      labels: string[];
      values: number[];
      chartType: "bar" | "line";
    }
  | {
      type: "calculator";
      title: string;
      fields: CalculatorField[];
      formula: string;
      resultLabel: string;
      unit?: string;
      note?: string;
      precision: number;
    }
  | {
      type: "questionnaire";
      title: string;
      questions: QuestionnaireQuestion[];
    }
  | { type: "choice"; question: string; options: string[] };

const MAX_BLOCKS = 3;
const MAX_TEXT = 240;
const GLOW_UI_FENCE_SOURCE = "```\\s*(?:glow-ui|genui|json)\\b[^\\r\\n]*(?:\\r?\\n)([\\s\\S]*?)(```|$)";

function glowUiFenceRegex(): RegExp {
  return new RegExp(GLOW_UI_FENCE_SOURCE, "gi");
}

function shortText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function cellText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length <= 500 ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return null;
}

function parseFormula(source: string, fields: Set<string>): FormulaNode | null {
  if (!source || source.length > 160) return null;
  const tokens: Array<{ type: "number" | "field" | "operator"; value: string }> = [];
  let remaining = source;
  while (remaining.trim()) {
    remaining = remaining.trimStart();
    const match = /^(?:(\d+(?:\.\d*)?|\.\d+)([eE][+-]?\d+)?|([A-Za-z_][A-Za-z0-9_]*)|([(),^+\-*/]))/.exec(remaining);
    if (!match) return null;
    if (match[1]) tokens.push({ type: "number", value: match[1] + (match[2] || "") });
    else if (match[3]) {
      tokens.push({ type: "field", value: match[3] });
    } else tokens.push({ type: "operator", value: match[4]! });
    if (tokens.length > 128) return null;
    remaining = remaining.slice(match[0].length);
  }

  let cursor = 0;
  const parsePrimary = (): FormulaNode | null => {
    const token = tokens[cursor++];
    if (!token) return null;
    if (token.type === "number") return { type: "number", value: Number(token.value) };
    if (token.type === "field") {
      if (tokens[cursor]?.value === "(") {
        if (!(token.value in FORMULA_FUNCTIONS)) return null;
        cursor++;
        const args: FormulaNode[] = [];
        do {
          if (args.length) cursor++;
          const arg = parseAdditive();
          if (!arg) return null;
          args.push(arg);
        } while (tokens[cursor]?.value === "," && args.length < 2);
        if (tokens[cursor]?.value !== ")" || args.length !== FORMULA_FUNCTIONS[token.value]!.arity) return null;
        cursor++;
        return { type: "call", name: token.value, args };
      }
      if (token.value === "pi" && !fields.has("pi")) return { type: "number", value: Math.PI };
      return fields.has(token.value) ? { type: "field", id: token.value } : null;
    }
    if (token.value === "(") {
      const expression = parseAdditive();
      if (!expression || tokens[cursor]?.value !== ")") return null;
      cursor++;
      return expression;
    }
    return null;
  };
  const parsePower = (): FormulaNode | null => {
    const left = parsePrimary();
    if (!left) return null;
    if (tokens[cursor]?.value !== "^") return left;
    cursor++;
    const right = parseUnary();
    return right ? { type: "binary", operator: "^", left, right } : null;
  };
  const parseUnary = (): FormulaNode | null => {
    const operator = tokens[cursor]?.value;
    if (operator === "+" || operator === "-") {
      cursor++;
      const operand = parseUnary();
      return operand ? { type: "unary", operator, operand } : null;
    }
    return parsePower();
  };
  const parseMultiplicative = (): FormulaNode | null => {
    let left = parseUnary();
    if (!left) return null;
    while (tokens[cursor]?.value === "*" || tokens[cursor]?.value === "/") {
      const operator = tokens[cursor++]!.value as "*" | "/";
      const right = parseUnary();
      if (!right) return null;
      left = { type: "binary", operator, left, right };
    }
    return left;
  };
  const parseAdditive = (): FormulaNode | null => {
    let left = parseMultiplicative();
    if (!left) return null;
    while (tokens[cursor]?.value === "+" || tokens[cursor]?.value === "-") {
      const operator = tokens[cursor++]!.value as "+" | "-";
      const right = parseMultiplicative();
      if (!right) return null;
      left = { type: "binary", operator, left, right };
    }
    return left;
  };

  const expression = parseAdditive();
  return expression && cursor === tokens.length ? expression : null;
}

function evaluateFormula(node: FormulaNode, values: Record<string, number>): number {
  if (node.type === "call") return FORMULA_FUNCTIONS[node.name]!.run(...node.args.map((arg) => evaluateFormula(arg, values)));
  if (node.type === "number") return node.value;
  if (node.type === "field") return values[node.id] ?? Number.NaN;
  if (node.type === "unary") {
    const value = evaluateFormula(node.operand, values);
    return node.operator === "-" ? -value : value;
  }
  const left = evaluateFormula(node.left, values);
  const right = evaluateFormula(node.right, values);
  switch (node.operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return right === 0 ? Number.NaN : left / right;
    case "^": return Math.pow(left, right);
  }
}

const FORMULA_FUNCTIONS: Record<string, { arity: number; run: (...args: number[]) => number }> = Object.assign(Object.create(null), {
  sin: { arity: 1, run: Math.sin }, cos: { arity: 1, run: Math.cos },
  tan: { arity: 1, run: (x: number) => Math.abs(Math.cos(x)) < 1e-12 ? Number.NaN : Math.tan(x) },
  sqrt: { arity: 1, run: Math.sqrt }, abs: { arity: 1, run: Math.abs },
  log: { arity: 1, run: Math.log }, exp: { arity: 1, run: Math.exp },
  pow: { arity: 2, run: Math.pow }, min: { arity: 2, run: Math.min }, max: { arity: 2, run: Math.max },
});

export function calculateFormula(formula: string, values: Record<string, number>): number | null {
  const expression = parseFormula(formula, new Set(Object.keys(values)));
  if (!expression) return null;
  const result = evaluateFormula(expression, values);
  return Number.isFinite(result) && Math.abs(result) <= 1e24 ? result : null;
}

function parseBlock(value: unknown): GenUiBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type === "study_plan") return validateStudyPlan(raw);

  if (type === "table") {
    const title = shortText(raw.title ?? "Table");
    if (!title || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;
    if (raw.columns.length < 1 || raw.columns.length > 8 || raw.rows.length < 1 || raw.rows.length > 40) return null;
    const columns = raw.columns.map((item) => shortText(item, 100));
    if (columns.some((item) => !item)) return null;
    const rows = raw.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== columns.length) return null;
      const cells = row.map(cellText);
      return cells.some((cell) => cell === null) ? null : (cells as string[]);
    });
    if (rows.some((row) => !row)) return null;
    const note = raw.note == null ? undefined : shortText(raw.note, 500);
    if (raw.note != null && !note) return null;
    return { type, title, columns: columns as string[], rows: rows as string[][], ...(note ? { note } : {}) };
  }

  if (type === "chart") {
    const title = shortText(raw.title ?? "Chart");
    if (!title || !Array.isArray(raw.labels) || !Array.isArray(raw.values)) return null;
    if (raw.labels.length < 2 || raw.labels.length > 32 || raw.values.length !== raw.labels.length) return null;
    const labels = raw.labels.map((item) => shortText(item, 80));
    if (raw.values.some((item) => typeof item !== "number")) return null;
    const values = raw.values as number[];
    if (labels.some((item) => !item) || values.some((item) => !Number.isFinite(item) || Math.abs(item) > 1e12)) return null;
    const chartType = raw.chartType === "line" ? "line" : "bar";
    return { type, title, labels: labels as string[], values, chartType };
  }

  if (type === "diagram") {
    // Reuse the exact calculator field contract; diagram expressions never execute JavaScript.
    const controls = parseBlock({ ...raw, type: "calculator", formula: "0", resultLabel: "Result" });
    if (controls?.type !== "calculator" || !Array.isArray(raw.points) || !Array.isArray(raw.lines) || !Array.isArray(raw.outputs)) return null;
    if (raw.points.length < 1 || raw.points.length > 24 || raw.lines.length > 32 || raw.outputs.length > 6) return null;
    const ids = new Set(controls.fields.map((field) => field.id));
    const pointIds = new Set<string>();
    const points: DiagramBlock["points"] = [];
    for (const item of raw.points) {
      if (!item || typeof item !== "object") return null;
      const id = shortText(item.id, 32), x = shortText(item.x, 160), y = shortText(item.y, 160);
      // An empty optional label means an unlabelled point, not an invalid diagram.
      const label = item.label == null || (typeof item.label === "string" && !item.label.trim())
        ? undefined : shortText(item.label, 40);
      if (!id || pointIds.has(id) || !x || !y || !parseFormula(x, ids) || !parseFormula(y, ids) || label === null) return null;
      pointIds.add(id); points.push({ id, x, y, ...(label ? { label } : {}) });
    }
    const lines: DiagramBlock["lines"] = [];
    for (const item of raw.lines) {
      if (!item || !pointIds.has(item.from) || !pointIds.has(item.to)) return null;
      lines.push({ from: item.from, to: item.to, accent: item.accent === true });
    }
    const outputs: DiagramBlock["outputs"] = [];
    for (const item of raw.outputs) {
      if (!item || typeof item !== "object") return null;
      const label = shortText(item.label), formula = shortText(item.formula, 160);
      const unit = item.unit == null ? undefined : shortText(item.unit, 24);
      if (!label || !formula || !parseFormula(formula, ids) || (item.unit != null && !unit)) return null;
      outputs.push({ label, formula, ...(unit ? { unit } : {}) });
    }
    return { type, title: controls.title, fields: controls.fields, points, lines, outputs, precision: controls.precision, ...(controls.note ? { note: controls.note } : {}) };
  }

  if (type === "calculator") {
    const title = shortText(raw.title);
    const resultLabel = shortText(raw.resultLabel);
    const unit = raw.unit == null ? undefined : shortText(raw.unit, 24);
    const note = raw.note == null ? undefined : shortText(raw.note, 500);
    if (!title || !resultLabel || (raw.unit != null && !unit) || (raw.note != null && !note)) return null;
    if (!Array.isArray(raw.fields) || raw.fields.length < 1 || raw.fields.length > 6) return null;
    const fields: CalculatorField[] = [];
    const ids = new Set<string>();
    for (const item of raw.fields) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const field = item as Record<string, unknown>;
      const id = shortText(field.id, 32);
      const label = shortText(field.label, 100);
      const min = field.min;
      const max = field.max;
      const step = field.step;
      const initial = field.initial;
      const control = field.control === "range" ? "range" : field.control === "number" ? "number" : null;
      if (
        !id || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id) || ids.has(id) || !label || !control ||
        typeof min !== "number" || typeof max !== "number" || typeof step !== "number" || typeof initial !== "number" ||
        ![min, max, step, initial].every(Number.isFinite) || min >= max || step <= 0 || step > max - min ||
        Math.abs(min) > 1e12 || Math.abs(max) > 1e12 || initial < min || initial > max
      ) return null;
      ids.add(id);
      fields.push({ id, label, min, max, step, initial, control });
    }
    const formula = shortText(raw.formula, 160);
    if (!formula || !parseFormula(formula, ids)) return null;
    const precision = raw.precision == null ? 2 : raw.precision;
    if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 0 || precision > 6) return null;
    return { type, title, fields, formula, resultLabel, ...(unit ? { unit } : {}), ...(note ? { note } : {}), precision };
  }

  if (type === "questionnaire") {
    const title = shortText(raw.title);
    if (!title || !Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 10) return null;
    const questions: QuestionnaireQuestion[] = [];
    const ids = new Set<string>();
    for (const item of raw.questions) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const question = item as Record<string, unknown>;
      const id = shortText(question.id, 32);
      const prompt = shortText(question.prompt, 300);
      const mode = question.mode === "single" || question.mode === "multiple" || question.mode === "text"
        ? question.mode
        : null;
      const required = question.required == null ? true : question.required;
      if (!id || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id) || ids.has(id) || !prompt || !mode || typeof required !== "boolean") return null;

      let options: string[] | undefined;
      if (mode === "text") {
        if (question.options != null) return null;
      } else {
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 8) return null;
        const parsedOptions = question.options.map((option) => shortText(option, 120));
        if (parsedOptions.some((option) => !option)) return null;
        options = parsedOptions as string[];
        if (new Set(options).size !== options.length) return null;
      }

      ids.add(id);
      questions.push({ id, prompt, mode, ...(options ? { options } : {}), required });
    }
    return { type, title, questions };
  }

  if (type === "choice") {
    const question = shortText(raw.question);
    if (!question || !Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 6) return null;
    const options = raw.options.map((item) => shortText(item, 120));
    if (options.some((item) => !item)) return null;
    const cleanedOptions = options as string[];
    if (new Set(cleanedOptions).size !== cleanedOptions.length) return null;
    return { type, question, options: cleanedOptions };
  }

  return null;
}

export function validateGenUiBlock(value: unknown): GenUiBlock | null {
  return parseBlock(value);
}

function blocksFromPayload(value: unknown): GenUiBlock[] {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).blocks)
      ? (value as { blocks: unknown[] }).blocks
      : [value];
  return candidates.map(parseBlock).filter((block): block is GenUiBlock => block !== null);
}

/** Recover a complete standalone JSON block when a model omits its glow-ui fence. */
function findStandaloneJson(text: string): Array<{ start: number; end: number; blocks: GenUiBlock[] }> {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  const found: Array<{ start: number; end: number; blocks: GenUiBlock[] }> = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmed = lines[lineIndex]!.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;

    let source = trimmed;
    for (let endLine = lineIndex; endLine < lines.length && endLine - lineIndex < 80; endLine++) {
      if (endLine > lineIndex) {
        const nextLine = lines[endLine]!.trim();
        if (/^`{1,3}$/.test(nextLine)) break;
        source += `\n${lines[endLine]}`;
      }
      if (source.length > 30_000) break;
      let parsed: unknown;
      try {
        parsed = JSON.parse(source);
      } catch {
        continue;
      }
      const blocks = blocksFromPayload(parsed);
      if (!blocks.length) break;
      let end = starts[endLine]! + lines[endLine]!.length;
      // Some models append a dangling fence even though they omitted its opener.
      if (endLine + 1 < lines.length && /^\s*`{1,3}\s*$/.test(lines[endLine + 1]!)) {
        end = starts[endLine + 1]! + lines[endLine + 1]!.length;
      }
      found.push({ start: starts[lineIndex]!, end, blocks });
      lineIndex = endLine;
      break;
    }
  }
  return found;
}

export function extractGenUiBlocks(text: string): GenUiBlock[] {
  const blocks: GenUiBlock[] = [];
  for (const match of text.matchAll(glowUiFenceRegex())) {
    try {
      const parsed = JSON.parse(match[1] ?? "") as unknown;
      blocks.push(...blocksFromPayload(parsed));
      if (blocks.length >= MAX_BLOCKS) return blocks.slice(0, MAX_BLOCKS);
    } catch {
      // Invalid model output is ignored; the normal text answer remains available.
    }
  }
  for (const standalone of findStandaloneJson(text)) {
    for (const block of standalone.blocks) {
      if (!blocks.some((existing) => JSON.stringify(existing) === JSON.stringify(block))) blocks.push(block);
      if (blocks.length >= MAX_BLOCKS) return blocks.slice(0, MAX_BLOCKS);
    }
  }
  return blocks;
}

export function stripGenUiFences(text: string, hideIncomplete = false): string {
  let stripped = text
    .replace(glowUiFenceRegex(), (full, body: string, close: string) => {
      const parsed = extractGenUiBlocks(`\`\`\`glow-ui\n${body}\n\`\`\``);
      return parsed.length || (hideIncomplete && !close) ? "" : full;
    });
  const standalone = findStandaloneJson(stripped).filter((match) => match.blocks.length > 0);
  for (const match of standalone.reverse()) {
    stripped = `${stripped.slice(0, match.start)}${stripped.slice(match.end)}`;
  }
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

export function genUiTitle(block: GenUiBlock): string {
  return block.type === "choice" ? block.question : block.title;
}

/** Re-render previously rejected blocks from saved messages without rewriting history. */
export function recoverInlineArtifacts(message: Message, saved: Artifact[]): Artifact[] {
  // Persisted artifacts (including later edits) remain authoritative.
  if (message.role !== "assistant" || saved.some((artifact) => artifact.message_id === message.id && artifact.kind === "genui")) return [];
  return extractGenUiBlocks(message.content).map((block, index) => ({
    id: `recovered:${message.id}:${index}`,
    conversation_id: message.conversation_id,
    message_id: message.id,
    kind: "genui",
    title: genUiTitle(block),
    content_path: null,
    content_text: JSON.stringify(block),
    meta_json: JSON.stringify({ schema: "glow-ui/v1", componentType: block.type, recovered: true }),
    created_at: message.created_at,
  }));
}

export function calculateCalculatorResult(
  block: Extract<GenUiBlock, { type: "calculator" }>,
  values: Record<string, number>,
): number | null {
  return calculateFormula(block.formula, values);
}

export function isArtifactEditRequest(text: string): boolean {
  const action = /\b(?:change|update|modify|edit|extend|refine|convert|turn|make|add)\b|(?:измени|изменить|поменяй|поменять|добавь|добавить|расширь|расширить|улучши|улучшить|преврати|превратить|сделай)/i.test(text);
  const reference = /\b(?:this|that|it|current|existing|same)\b|(?:этот|эту|этого|это|его|её|нее|него|текущ|сюда|в него|в неё|к этому|к этой)/i.test(text);
  const explicitChartEdit = /(?:change|switch|измен[иь]|поменяй)\s+(?:the\s+)?(?:chart\s+type|type\s+of\s+(?:the\s+)?chart|тип\s+(?:этого\s+)?графика|вид\s+(?:этого\s+)?графика)/i.test(text);
  const asksForNew = /\bnew\b|(?:нов(?:ый|ую|ое|ого)|ещё один|еще один)/i.test(text);
  return !asksForNew && (explicitChartEdit || (action && reference));
}

export function requestedChartType(text: string): "bar" | "line" | null {
  if (!/(?:^|\s)(?:измени|поменяй|переключи|сделай|change|switch|make|set)(?:\s|$)/i.test(text)) return null;
  if (/(?:линейн|\bline\b)/i.test(text)) return "line";
  if (/(?:столбчат|\bbar\b)/i.test(text)) return "bar";
  return null;
}
