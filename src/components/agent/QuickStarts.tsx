import { Bug, FileText, FlaskConical, FolderSearch, FolderTree, GitCompare, GraduationCap, Presentation, Table2, type LucideIcon } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import type { CodeKind } from "../../lib/codeKind";
import { useChatStore } from "../../stores/chatStore";

type Start = { icon: LucideIcon; label: [string, string]; prompt: [string, string] };

/** [ru, en] pairs. Prompts that end with a colon wait for the user to finish the sentence. */
const STARTS: Record<CodeKind, Start[]> = {
  dev: [
    { icon: FolderTree, label: ["Объяснить проект", "Explain the project"], prompt: ["Объясни структуру проекта и как его запускать", "Explain the structure of the project and how to run it"] },
    { icon: Bug, label: ["Починить тесты", "Fix failing tests"], prompt: ["Прогони тесты и почини то, что падает", "Run the tests and fix whatever fails"] },
    { icon: FlaskConical, label: ["Написать тесты", "Write tests"], prompt: ["Напиши тесты для самых важных функций", "Write tests for the most important functions"] },
    { icon: GitCompare, label: ["Что изменилось", "What changed"], prompt: ["Покажи, что изменилось в проекте (git), и кратко опиши", "Show what changed in the project (git) and summarise it"] },
  ],
  work: [
    { icon: GraduationCap, label: ["Курсовая работа", "Coursework"], prompt: ["Напиши курсовую работу на тему: ", "Write a coursework on the topic: "] },
    { icon: Presentation, label: ["Презентация", "Presentation"], prompt: ["Сделай презентацию на 10 слайдов про: ", "Make a 10-slide presentation about: "] },
    { icon: Table2, label: ["Таблица Excel", "Excel table"], prompt: ["Сделай таблицу в Excel: ", "Make an Excel spreadsheet: "] },
    { icon: FileText, label: ["Отчёт Word", "Word report"], prompt: ["Подготовь отчёт в Word по теме: ", "Prepare a Word report on: "] },
    { icon: FolderSearch, label: ["Разобрать папку", "Review the folder"], prompt: ["Прочитай документы в папке и сделай краткое резюме", "Read the documents in the folder and write a short summary"] },
  ],
};

/** One-click starters under the empty composer; they only fill the draft, the user still presses send. */
export function QuickStarts({ kind, locale }: { kind: CodeKind; locale: Locale }) {
  const setDraft = useChatStore((state) => state.setDraft);
  const index = locale === "ru" ? 0 : 1;
  const accent = kind === "dev" ? "var(--kind-dev)" : "var(--kind-work)";
  return (
    <div className="mx-auto mt-4 flex max-w-[720px] flex-wrap justify-center gap-2" aria-label={locale === "ru" ? "Быстрый старт" : "Quick start"}>
      {STARTS[kind].map(({ icon: Icon, label, prompt }) => (
        <button
          key={label[0]}
          type="button"
          onClick={() => {
            setDraft(prompt[index]);
            window.setTimeout(() => document.querySelector("textarea")?.focus(), 0);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[13px] text-[var(--fg-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--accent-color)_55%,transparent)] hover:text-[var(--fg)]"
          style={{ ["--accent-color" as string]: accent }}
        >
          <Icon size={14} strokeWidth={1.8} style={{ color: accent }} />
          {label[index]}
        </button>
      ))}
    </div>
  );
}
