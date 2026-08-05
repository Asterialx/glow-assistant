export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function nowMs(): number {
  return Date.now();
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function estimateTokens(text: string): number {
  // Rough heuristic ~4 chars/token
  return Math.max(1, Math.ceil(text.length / 4));
}

function clipTitle(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 12 ? cut.slice(0, sp) : cut).trim()}…`;
}

function capFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}

function lowerFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toLocaleLowerCase() + t.slice(1);
}

function stripTailPolite(s: string): string {
  return s
    .replace(/\s*,?\s*(пожалуйста|please)\s*$/i, "")
    .replace(/[.?!…]+$/g, "")
    .trim();
}

/**
 * Sidebar chat title: short topical label, not a raw paste of the first words.
 * e.g. "привет расскажи о себе" → "Приветствие и рассказ о себе"
 */
export function titleFromFirstMessage(text: string, maxLen = 48): string {
  const raw = text
    .replace(/^\[Voice message\]\s*/i, "")
    .replace(/^\[Attached:[^\]]*\]\s*/i, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "New chat";

  const ruInput = /[а-яё]/i.test(raw);
  const greetRe =
    /^(привет|здравствуй(?:те)?|добр(?:ый|ое|ой)\s+(?:день|вечер|утро|ночи)|хай|hello|hi|hey|good\s+(?:morning|afternoon|evening))(?:\s*[,!.…]+\s*|\s+|$)/i;

  let greeting = false;
  let t = raw;
  // Strip greeting from the full message first (so "Привет! Расскажи…" keeps the request)
  if (greetRe.test(t)) {
    greeting = true;
    t = t.replace(greetRe, "").trim();
  }

  if (t) {
    const clause = t.split(/(?<=[.!?…])\s+|;\s+/)[0]?.trim() || t;
    t = stripTailPolite(clause);
  }

  t = t
    .replace(
      /^(пожалуйста|please|будь\s+добр(?:а)?|можешь(?:\s+ли)?|could\s+you(?:\s+please)?|can\s+you(?:\s+please)?|would\s+you)\s*,?\s+/i,
      "",
    )
    .replace(/^(скажи(?:те)?|подскажи(?:те)?|помоги(?:те)?)\s+/i, "")
    .trim();
  t = stripTailPolite(t);

  if (!t) {
    return greeting ? (ruInput ? "Приветствие" : "Greeting") : "New chat";
  }

  const isRu = ruInput || /[а-яё]/i.test(t);
  let title: string | null = null;

  let m = t.match(
    /^(?:расскажи(?:те)?|поведай|tell\s+me)\s+(?:о|про|об|about)\s+(.+)$/i,
  );
  if (m) {
    const topic = stripTailPolite(m[1]!);
    if (/^(себе|себя|yourself|you)$/i.test(topic)) {
      title = isRu ? "Рассказ о себе" : "About yourself";
    } else {
      title = isRu ? `Рассказ о ${topic}` : `About ${topic}`;
    }
  }

  if (!title) {
    m = t.match(/^(?:что\s+такое|что\s+есть|what(?:'s|\s+is))\s+(.+)$/i);
    if (m) {
      const topic = stripTailPolite(m[1]!);
      title = isRu ? `Что такое ${topic}` : `What is ${topic}`;
    }
  }

  if (!title) {
    m = t.match(/^как\s+(.+)$/i);
    if (m) title = `Как ${stripTailPolite(m[1]!)}`;
  }
  if (!title) {
    m = t.match(/^how\s+(?:do\s+i\s+|can\s+i\s+|to\s+)(.+)$/i);
    if (m) title = `How to ${stripTailPolite(m[1]!)}`;
  }

  if (!title) {
    m = t.match(/^(напиши(?:те)?|создай(?:те)?|сделай(?:те)?|сгенерируй(?:те)?)\s+(.+)$/i);
    if (m) {
      const verbRaw = m[1]!.toLowerCase();
      const topic = stripTailPolite(m[2]!);
      const verb = verbRaw.startsWith("напиш")
        ? "Написать"
        : verbRaw.startsWith("созда")
          ? "Создать"
          : verbRaw.startsWith("сгенер")
            ? "Сгенерировать"
            : "Сделать";
      title = `${verb} ${topic}`;
    }
  }
  if (!title) {
    m = t.match(/^(write|create|make|generate)\s+(.+)$/i);
    if (m) {
      const verb = capFirst(m[1]!);
      title = `${verb} ${stripTailPolite(m[2]!)}`;
    }
  }

  if (!title) {
    m = t.match(/^(?:объясни(?:те)?|поясни(?:те)?|explain)\s+(.+)$/i);
    if (m) {
      const topic = stripTailPolite(m[1]!);
      title = isRu ? `Объяснение: ${topic}` : `Explain: ${topic}`;
    }
  }

  if (!title) {
    m = t.match(/^(?:переведи(?:те)?|translate)\s+(.+)$/i);
    if (m) {
      const topic = stripTailPolite(m[1]!);
      title = isRu ? `Перевод: ${topic}` : `Translate: ${topic}`;
    }
  }

  if (!title) {
    m = t.match(/^(?:почему|зачем|why)\s+(.+)$/i);
    if (m) {
      const topic = stripTailPolite(m[1]!);
      title = isRu ? `Почему ${topic}` : `Why ${topic}`;
    }
  }

  if (!title) title = stripTailPolite(t);
  title = capFirst(title);

  if (greeting) {
    const greetLabel = ruInput ? "Приветствие" : "Greeting";
    const conj = ruInput ? "и" : "and";
    const combined = `${greetLabel} ${conj} ${lowerFirst(title)}`;
    if (combined.length <= maxLen) title = combined;
  }

  return clipTitle(title, maxLen);
}

export function isDefaultChatTitle(title: string | null | undefined): boolean {
  const t = (title || "").trim().toLowerCase();
  return !t || t === "new chat" || t === "новый чат";
}
