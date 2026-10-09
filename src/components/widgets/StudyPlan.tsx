import { useId, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { setStudyCompletion, studyProgress, studyTaskKey, studyTaskKeys, type StudyPlanBlock } from "../../lib/studyPlan";
import "./StudyPlan.css";

export function StudyPlan({ block, completed = {}, onChange, locale }: {
  block: StudyPlanBlock;
  completed?: Record<string, boolean>;
  onChange: (completed: Record<string, boolean>) => void;
  locale: "ru" | "en";
}) {
  const instance = useId();
  const keys = studyTaskKeys(block);
  const progress = studyProgress(keys, completed);
  const completionRef = useRef(completed);
  completionRef.current = completed;
  const mark = (targetKeys: string[], checked: boolean) => {
    const next = setStudyCompletion(keys, completionRef.current, targetKeys, checked);
    completionRef.current = next;
    onChange(next);
  };
  const ru = locale === "ru";

  return <div className="glow-study-plan">
    <div className="space-y-2 border-b border-[var(--border)] px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
        <span aria-live="polite">{ru ? "Выполнено" : "Completed"} {progress.done} {ru ? "из" : "of"} {progress.total}</span>
        <span className="tabular-nums text-[var(--fg)]">{progress.percent}%</span>
      </div>
      <div role="progressbar" aria-label={ru ? "Прогресс подготовки" : "Study progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
        aria-valuetext={`${progress.done} / ${progress.total}`} className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-hover)]">
        <div style={{ width: `${progress.percent}%` }} className="h-full rounded-full bg-[var(--accent)]" />
      </div>
    </div>
    <div className="divide-y divide-[var(--border)]">
      {block.days.map((day, dayIndex) => {
        const dayKeys = day.topics.flatMap((topic) => topic.tasks.map((task) => studyTaskKey(day, topic, task)));
        const dayProgress = studyProgress(dayKeys, completed);
        return <div key={day.id} className="px-3 py-3">
          <div className="mb-2 flex items-center gap-2.5">
            <input type="checkbox" checked={dayProgress.done === dayProgress.total}
              ref={(element) => { if (element) element.indeterminate = dayProgress.done > 0 && dayProgress.done < dayProgress.total; }}
              onChange={(event) => mark(dayKeys, event.currentTarget.checked)}
              aria-label={ru ? `Отметить весь день ${dayIndex + 1}: ${day.title}` : `Complete day ${dayIndex + 1}: ${day.title}`}
              className="glow-plan-check shrink-0 cursor-pointer" />
            <span className="min-w-0 flex-1 text-sm font-medium text-[var(--fg)]">{ru ? "День" : "Day"} {dayIndex + 1} · {day.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-[var(--fg-faint)]">{dayProgress.done}/{dayProgress.total}</span>
          </div>
          <div className="space-y-2">
            {day.topics.map((topic, topicIndex) => {
              const topicKeys = topic.tasks.map((task) => studyTaskKey(day, topic, task));
              const topicProgress = studyProgress(topicKeys, completed);
              return <details key={topic.id} className="glow-plan-topic group/topic">
                <summary className="glow-plan-topic-button flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={14} className="shrink-0 -rotate-90 group-open/topic:rotate-0" />
                  <span className="min-w-0 flex-1">{topic.title}</span>
                  <span className="glow-plan-count shrink-0 text-xs tabular-nums">{topicProgress.done}/{topicProgress.total}</span>
                </summary>
                <div className="space-y-3 px-2 pb-3 pt-3">
                  {topic.tasks.map((task, taskIndex) => {
                    const key = studyTaskKey(day, topic, task), checked = completed[key] === true;
                    const controlId = `${instance}-${dayIndex}-${topicIndex}-${taskIndex}`;
                    return <div key={task.id} className="flex items-start gap-2.5 pl-5">
                      <input id={controlId} type="checkbox" checked={checked} onChange={(event) => mark([key], event.currentTarget.checked)}
                        className="glow-plan-check mt-1 shrink-0 cursor-pointer" />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={controlId} className={`cursor-pointer text-sm ${checked ? "text-[var(--fg-faint)] line-through" : "text-[var(--fg)]"}`}>{task.title}</label>
                        {task.description && <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-[var(--fg-muted)]">{task.description}</p>}
                        {task.minutes && <span className="mt-1 block text-xs text-[var(--fg-faint)]">{task.minutes} {ru ? "мин" : "min"}</span>}
                      </div>
                    </div>;
                  })}
                </div>
              </details>;
            })}
          </div>
        </div>;
      })}
    </div>
    {block.note && <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--fg-faint)]">{block.note}</p>}
  </div>;
}
