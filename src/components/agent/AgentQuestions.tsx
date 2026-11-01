import { useEffect, useState } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import type { Question } from "../../lib/agent/loop";
import { useAgentStore } from "../../stores/agentStore";
import { cn } from "../../lib/utils";

/** Multiple-choice questions from the agent, one at a time: click an option (or type your own) and go on. */
export function AgentQuestions({ locale }: { locale: Locale }) {
  const open = useAgentStore((state) => state.questions);
  const answerQuestions = useAgentStore((state) => state.answerQuestions);
  if (!open) return null;
  return <Form key={open.questions.map((q) => q.question).join("|")} questions={open.questions} locale={locale} onDone={answerQuestions} />;
}

function Form({ questions, locale, onDone }: { questions: Question[]; locale: Locale; onDone: ReturnType<typeof useAgentStore.getState>["answerQuestions"] }) {
  const ru = locale === "ru";
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const [other, setOther] = useState<string[]>(() => questions.map(() => ""));
  const question = questions[index]!;
  const last = index === questions.length - 1;
  const answered = picked[index]!.length > 0 || other[index]!.trim().length > 0;

  const toggle = (label: string) => setPicked((current) => current.map((list, i) => {
    if (i !== index) return list;
    if (!question.multiSelect) return list[0] === label ? [] : [label];
    return list.includes(label) ? list.filter((item) => item !== label) : [...list, label];
  }));

  const next = () => {
    if (!answered) return;
    if (!last) { setIndex(index + 1); return; }
    onDone(questions.map((_, i) => ({ selected: picked[i]!, ...(other[i]!.trim() ? { other: other[i]!.trim() } : {}) })));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onDone(null); return; }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;
      const option = question.options[Number(event.key) - 1];
      if (option && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggle(option.label); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={ru ? "Вопросы агента" : "Agent questions"} className="w-full max-w-lg overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center gap-3 px-6 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><MessageCircleQuestion size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--fg-faint)]">{question.header ?? (ru ? "Уточнение" : "Question")}</div>
            <div className="flex gap-1 pt-1" aria-hidden>
              {questions.map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-[var(--accent)]" : "bg-[var(--bg-hover)]")} />)}
            </div>
          </div>
          <span className="text-[12px] text-[var(--fg-faint)]">{index + 1}/{questions.length}</span>
        </div>
        <div className="space-y-3 px-6 pb-5 pt-4">
          <h2 className="text-[16px] font-medium leading-6 text-[var(--fg)]">{question.question}</h2>
          <div className="flex flex-col gap-1.5" role={question.multiSelect ? "group" : "radiogroup"}>
            {question.options.map((option, i) => {
              const on = picked[index]!.includes(option.label);
              return (
                <button key={option.label} type="button" role={question.multiSelect ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(option.label)} className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", on ? "bg-[var(--bg-active)]" : "bg-[var(--bg)] hover:bg-[var(--bg-hover)]")}>
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[11px]", question.multiSelect ? "rounded-md" : "rounded-full", on ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-hover)] text-[var(--fg-faint)]")}>{on ? <Check size={12} strokeWidth={2.5} /> : i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-[var(--fg)]">{option.label}</span>
                    {option.description && <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-muted)]">{option.description}</span>}
                  </span>
                </button>
              );
            })}
            <input
              value={other[index]}
              onChange={(event) => setOther((current) => current.map((text, i) => (i === index ? event.target.value : text)))}
              onKeyDown={(event) => { if (event.key === "Enter") next(); }}
              placeholder={ru ? "Другое: напишите свой вариант" : "Other: type your own answer"}
              className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-[14px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus:bg-[var(--bg-hover)]"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => onDone(null)} className="rounded-lg px-3 py-2 text-[13px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]">{ru ? "Пропустить" : "Skip"}</button>
            {index > 0 && <button type="button" onClick={() => setIndex(index - 1)} className="rounded-lg px-3 py-2 text-[13px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]">{ru ? "Назад" : "Back"}</button>}
            <button type="button" disabled={!answered} onClick={next} className="ml-auto rounded-xl bg-[var(--accent)] px-5 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">{last ? (ru ? "Отправить" : "Send") : (ru ? "Далее" : "Next")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
