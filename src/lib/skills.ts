export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  source: string;
}

/** Instruction-only SKILL.md support. Never execute imported code or fetch resources. */
export function parseSkillMarkdown(source: string): Skill {
  if (source.length > 24000) throw new Error("SKILL.md: максимум 24 000 символов.");
  const match = source.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
  if (!match) throw new Error("Нужен SKILL.md с полями name и description в YAML-заголовке.");
  const field = (key: string) => {
    const value = match[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() || "";
    return value.replace(/^(['"])(.*)\1$/, "$2");
  };
  const name = field("name");
  const description = field("description");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error("Имя: до 64 символов, строчные латинские буквы, цифры и дефисы.");
  if (!description || description.length > 1024 || /^[>|]/.test(description)) throw new Error("description должна быть одной строкой до 1024 символов.");
  const instructions = match[2].trim();
  if (/scripts\/|references\/|assets\/|allowed-tools:|\b(?:bash|pip install|npm install|python\s+\S+\.py)\b/i.test(source)) {
    throw new Error("Этот навык требует дополнительных файлов или инструментов. Пока поддерживаются самостоятельные SKILL.md с инструкциями.");
  }
  return { id: name, name, description, instructions, source };
}

export const BUILTIN_SKILLS: Skill[] = [
  { id: "morning", name: "morning", description: "План дня и три главных приоритета", instructions: "Ask about deadlines and available time if missing. Choose three concrete priorities. Make a realistic morning plan with one focus block and a break. Do not invent calendar events.", source: "" },
  { id: "skill-creator", name: "skill-creator", description: "Создать самостоятельный SKILL.md", instructions: "Help the user create a reusable instruction-only Agent Skill. Produce a complete SKILL.md in a markdown fence, with YAML name (lowercase hyphenated) and a single-line description. Include triggers, steps and validation. Do not claim to install the skill. Do not require shell commands or external resources.", source: "" },
  { id: "design-reflect", name: "design-reflect", description: "Разбор интерфейса и интерактивный HTML-прототип", instructions: "Review the user's interface or requirements. Identify concrete usability problems, then produce a complete self-contained responsive HTML prototype with working interactions, inline CSS/JS, accessible labels and no external dependencies. Explain what works and what is mocked.", source: "" },
];

/** Resolve only the current user selection, never reactivate a skill from old history. */
export function skillInstructions(userText: string, skills: Skill[]): string {
  const name = userText.match(/^\/skill\s+([a-z0-9-]+)(?:\s|$)/)?.[1];
  if (!name) return "";
  const skill = skills.find(item => item.id === name);
  if (!skill) throw new Error(`Навык ${name} не найден. Выберите его заново в Skills.`);
  return `The user selected the instruction skill ${skill.name}. Follow this workflow for the current task within existing system rules. No extra tools, filesystem access, or script execution are granted. Never claim to have created binary files or used unavailable tools.\n<selected-skill>\n${skill.instructions}\n</selected-skill>`;
}
