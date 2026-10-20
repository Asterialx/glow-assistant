// Chapter-by-chapter coursework pipeline. Pure logic: the model call is injected, so it can be tested without a network.

export type CourseworkOutline = { title: string; chapters: { title: string; points: string[] }[] };
export type CourseworkMessage = { role: "system" | "user"; content: string };
export type CourseworkDeps = {
  complete: (messages: CourseworkMessage[], maxTokens: number) => Promise<string>;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
  pages?: number;
  chapterMaxTokens?: number;
};

export const COURSEWORK_MIN_CHAPTERS = 3;
export const COURSEWORK_MAX_CHAPTERS = 8;
/** Keeps the final glow-file content under the 80 000 character limit enforced by validateGeneratedFile. */
export const COURSEWORK_MAX_CHARS = 78_000;

export function isCourseworkRequest(text: string): boolean {
  // \w is ASCII-only in JavaScript, so Cyrillic word endings need an explicit class.
  return /курсов[а-яё]*|coursework/i.test(text);
}

export function parseOutline(raw: string): CourseworkOutline {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Не удалось получить план курсовой.");
  let value: any;
  try { value = JSON.parse(raw.slice(start, end + 1)); }
  catch { throw new Error("План курсовой вернулся в неверном формате."); }
  const title = typeof value?.title === "string" ? value.title.trim().slice(0, 180) : "";
  const chapters = Array.isArray(value?.chapters) ? value.chapters : [];
  if (!title || chapters.length < COURSEWORK_MIN_CHAPTERS || chapters.length > COURSEWORK_MAX_CHAPTERS) {
    throw new Error(`План курсовой должен содержать от ${COURSEWORK_MIN_CHAPTERS} до ${COURSEWORK_MAX_CHAPTERS} глав.`);
  }
  return {
    title,
    chapters: chapters.map((chapter: any) => {
      const chapterTitle = typeof chapter?.title === "string" ? chapter.title.trim().slice(0, 160) : "";
      if (!chapterTitle) throw new Error("В плане курсовой есть глава без названия.");
      const points = Array.isArray(chapter.points) ? chapter.points.slice(0, 8).map((point: unknown) => String(point).slice(0, 300)) : [];
      return { title: chapterTitle, points };
    }),
  };
}

/** Headings inside a chapter are demoted so they cannot collide with the document title or chapter headings. */
export function sanitizeChapterText(text: string): string {
  return text
    .replace(/```glow-file[\s\S]*?```/g, "")
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      return match ? `### ${match[2].trim()}` : line;
    })
    .join("\n")
    .trim();
}

export function assembleCoursework(outline: CourseworkOutline, chapterTexts: string[], references: string): string {
  const contents = outline.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}`).join("\n");
  const sections = outline.chapters.map((chapter, index) => `## ${index + 1}. ${chapter.title}\n\n${chapterTexts[index]}`);
  const bibliography = `## Список литературы\n\n${references.trim()}`;
  const markdown = [`# ${outline.title}`, `## Содержание\n\n${contents}`, ...sections, bibliography].join("\n\n");
  if (markdown.length > COURSEWORK_MAX_CHARS) {
    throw new Error("Курсовая получилась слишком длинной для одного файла. Уменьшите объём страниц и повторите.");
  }
  return markdown;
}

function outlinePrompt(topic: string, pages: number): CourseworkMessage[] {
  return [
    { role: "system", content: 'Ты помогаешь составить план курсовой работы. Верни только JSON вида {"title":"...","chapters":[{"title":"...","points":["..."]}]} без пояснений и без markdown. Глав от 3 до 8. Последняя глава — «Заключение».' },
    { role: "user", content: `Тема: ${topic}\nОбъём: около ${pages} страниц.` },
  ];
}

function chapterPrompt(topic: string, outline: CourseworkOutline, index: number, previous: string[], pages: number): CourseworkMessage[] {
  const chapter = outline.chapters[index];
  const wordTarget = Math.max(400, Math.round((pages * 280) / outline.chapters.length));
  const headings = outline.chapters.map((item, i) => `${i + 1}. ${item.title}`).join("\n");
  const tail = previous.length ? `Конец предыдущей главы (для связности):\n${previous[previous.length - 1].slice(-1200)}` : "";
  return [
    { role: "system", content: "Пиши связный академический текст на русском языке в Markdown. Используй подразделы с заголовками ### и не пиши заголовок главы: он добавится сам. Не выдумывай цифры, даты и источники. Если ссылаешься на источник, ставь номер в квадратных скобках, например [1], и не добавляй список литературы." },
    { role: "user", content: `Тема курсовой: ${topic}\nПлан работы:\n${headings}\n\nСейчас пишем главу ${index + 1}: ${chapter.title}\nКлючевые пункты: ${chapter.points.join("; ") || "раскрыть тему главы"}\nОбъём главы: примерно ${wordTarget} слов.\n${tail}` },
  ];
}

function referencesPrompt(topic: string): CourseworkMessage[] {
  return [
    { role: "system", content: "Составь список литературы для курсовой работы: 10–15 нумерованных позиций в стиле ГОСТ Р 7.0.100. Включай только источники, в реальности которых уверен. Выведи только список, без пояснений." },
    { role: "user", content: `Тема: ${topic}` },
  ];
}

/** Marks the assistant message that asks clarifying questions, so the next user message is read as an answer. */
export const COURSEWORK_QUESTIONS_MARK = "Перед написанием курсовой уточню:";

export function clarifyPrompt(topic: string): CourseworkMessage[] {
  return [
    { role: "system", content: 'Ты помогаешь подготовить курсовую работу. Реши, нужны ли уточнения, чтобы написать хорошую работу. Спрашивай только о важном: тема и её формулировка, направление и аудитория, объём, методы или источники, требования вуза. Не больше 4 вопросов. Если у вопроса есть очевидные варианты ответа, дай 2–5 коротких options, иначе options не указывай. Верни только JSON {"ready":true|false,"questions":[{"prompt":"...","options":["..."]}]} без пояснений.' },
    { role: "user", content: `Запрос: ${topic}` },
  ];
}

export type ClarifyingQuestion = { prompt: string; options?: string[] };

export function parseClarification(raw: string): { ready: boolean; questions: ClarifyingQuestion[] } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { ready: true, questions: [] };
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    const questions: ClarifyingQuestion[] = Array.isArray(value?.questions)
      ? value.questions.slice(0, 4).flatMap((item: unknown): ClarifyingQuestion[] => {
        if (typeof item === "string" && item.trim()) return [{ prompt: item.trim().slice(0, 300) }];
        const question = item as { prompt?: unknown; options?: unknown };
        if (typeof question?.prompt !== "string" || !question.prompt.trim()) return [];
        const options = Array.isArray(question.options)
          ? [...new Set(question.options.filter((o: unknown) => typeof o === "string" && o.trim()).map((o: string) => o.trim().slice(0, 120)))].slice(0, 5)
          : [];
        return [{ prompt: question.prompt.trim().slice(0, 300), ...(options.length >= 2 ? { options } : {}) }];
      })
      : [];
    return value?.ready === false && questions.length > 0 ? { ready: false, questions } : { ready: true, questions: [] };
  } catch {
    return { ready: true, questions: [] };
  }
}

/** Questions go out as an interactive questionnaire block, the same card the chat uses for clarifications. */
export function formatQuestions(questions: ClarifyingQuestion[]): string {
  const block = {
    type: "questionnaire",
    title: "Уточнения для курсовой",
    questions: questions.map((question, index) => question.options
      ? { id: `q${index + 1}`, prompt: question.prompt, mode: "single", options: question.options, required: false }
      : { id: `q${index + 1}`, prompt: question.prompt, mode: "text", required: false }),
  };
  return `${COURSEWORK_QUESTIONS_MARK}\n\n\`\`\`glow-ui\n${JSON.stringify(block)}\n\`\`\`\n\nМожно ответить на вопросы карточкой выше или написать «пропустить».`;
}

/** The last coursework request before the most recent assistant message, or "" when there is none. */
export function courseworkRequestBefore(history: { role: string; content: unknown }[]): string {
  const lastAssistant = history.map((message) => message.role).lastIndexOf("assistant");
  for (let index = lastAssistant - 1; index >= 0; index--) {
    const message = history[index];
    if (message.role === "user" && typeof message.content === "string" && isCourseworkRequest(message.content)) return message.content;
  }
  return "";
}

export function isAwaitingCourseworkAnswer(history: { role: string; content: unknown }[]): boolean {
  const lastAssistant = [...history].reverse().find((message) => message.role === "assistant");
  return typeof lastAssistant?.content === "string" && lastAssistant.content.startsWith(COURSEWORK_QUESTIONS_MARK);
}

export async function generateCoursework(topic: string, deps: CourseworkDeps): Promise<{ title: string; markdown: string }> {
  const checkAborted = () => { if (deps.signal?.aborted) throw new Error("Генерация остановлена."); };
  const status = (text: string) => deps.onStatus?.(text);
  const pages = deps.pages ?? 30;
  const chapterMaxTokens = deps.chapterMaxTokens ?? 8000;

  status("Составляю план курсовой…");
  let outline: CourseworkOutline;
  try {
    outline = parseOutline(await deps.complete(outlinePrompt(topic, pages), 2000));
  } catch {
    checkAborted();
    outline = parseOutline(await deps.complete(outlinePrompt(topic, pages), 2000));
  }

  const chapterTexts: string[] = [];
  for (let index = 0; index < outline.chapters.length; index++) {
    checkAborted();
    status(`Пишу главу ${index + 1} из ${outline.chapters.length}: ${outline.chapters[index].title}`);
    const text = await deps.complete(chapterPrompt(topic, outline, index, chapterTexts, pages), chapterMaxTokens);
    chapterTexts.push(sanitizeChapterText(text));
  }

  checkAborted();
  status("Составляю список литературы…");
  const references = await deps.complete(referencesPrompt(topic), 2000);
  checkAborted();
  return { title: outline.title, markdown: assembleCoursework(outline, chapterTexts, references) };
}
