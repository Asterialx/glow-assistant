import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, LineChart, PanelRight } from "lucide-react";
import type { Artifact } from "../../lib/types";
import { calculateFormula, validateGenUiBlock, type GenUiBlock } from "../../lib/genUi";
import { InteractiveDiagram } from "./InteractiveDiagram";
import { StudyPlan } from "./StudyPlan";
import { useUiStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";

interface Props {
  artifact: Artifact;
  surface: "inline" | "workspace";
  onExpand?: (artifactId: string) => void;
  onSend?: (text: string) => void;
}

export function GenUiArtifact({ artifact, surface, onExpand, onSend }: Props) {
  const viewState = useUiStore((state) => state.artifactViewState[artifact.id]);
  const setArtifactViewState = useUiStore((state) => state.setArtifactViewState);
  const locale = useUiStore((state) => state.locale);
  const streaming = useChatStore((state) => state.streaming);
  const block = useMemo(() => {
    try {
      return validateGenUiBlock(JSON.parse(artifact.content_text || "null"));
    } catch {
      return null;
    }
  }, [artifact.content_text]);

  if (!block) {
    return (
      <div className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg-muted)]">
        {locale === "ru" ? "Этот интерактивный блок не удалось безопасно отобразить." : "This interactive block could not be rendered safely."}
      </div>
    );
  }

  const heading = block.type === "choice" ? block.question : block.title;
  const chartType = viewState?.chartType || block.type === "chart" && block.chartType || "bar";
  const isInline = surface === "inline";

  return (
    <section className="my-3 min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] font-sans">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg)]">{heading}</span>
        {isInline && onExpand && (
          <button
            type="button"
            onClick={() => onExpand(artifact.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
            aria-label={locale === "ru" ? "Развернуть в рабочую область" : "Expand to workspace"}
            title={locale === "ru" ? "Развернуть в Artifacts" : "Expand in Artifacts"}
          >
            <PanelRight size={13} />
            {locale === "ru" ? "Развернуть" : "Expand"}
          </button>
        )}
      </header>

      {block.type === "study_plan" && <StudyPlan block={block} locale={locale} completed={viewState?.studyCompleted}
        onChange={(studyCompleted) => setArtifactViewState(artifact.id, { studyCompleted })} />}

      {block.type === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--bg-hover)]/50">
                {block.columns.map((column, index) => (
                  <th key={`${column}-${index}`} className="whitespace-nowrap px-3 py-2 font-medium text-[var(--fg-muted)]">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-[var(--border)]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="max-w-[24rem] px-3 py-2 align-top text-[var(--fg)]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {block.type === "chart" && (
        <div className="p-3">
          <div className="mb-2 flex justify-end gap-1" role="group" aria-label={locale === "ru" ? "Тип диаграммы" : "Chart type"}>
            <button
              type="button"
              onClick={() => setArtifactViewState(artifact.id, { chartType: "bar" })}
              aria-pressed={chartType === "bar"}
              aria-label={locale === "ru" ? "Столбчатая диаграмма" : "Bar chart"}
              className={`rounded-lg p-1.5 ${chartType === "bar" ? "bg-[var(--bg-active)] text-[var(--fg)]" : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"}`}
            ><BarChart3 size={15} /></button>
            <button
              type="button"
              onClick={() => setArtifactViewState(artifact.id, { chartType: "line" })}
              aria-pressed={chartType === "line"}
              aria-label={locale === "ru" ? "Линейный график" : "Line chart"}
              className={`rounded-lg p-1.5 ${chartType === "line" ? "bg-[var(--bg-active)] text-[var(--fg)]" : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"}`}
            ><LineChart size={15} /></button>
          </div>
          <Chart block={block} chartType={chartType === "line" ? "line" : "bar"} locale={locale} />
        </div>
      )}

      {(block.type === "calculator" || block.type === "diagram") && (
        <Calculator
          key={artifact.content_text}
          artifactId={artifact.id}
          block={block}
          locale={locale}
          savedValues={viewState?.calculatorValues}
          onValuesChange={(calculatorValues) => setArtifactViewState(artifact.id, { calculatorValues })}
        />
      )}

      {block.type === "choice" && (
        <div className="space-y-3 p-3">
          <p className="text-sm text-[var(--fg-muted)]">{locale === "ru" ? "Выберите вариант, чтобы продолжить." : "Choose an option to continue."}</p>
          <div className="flex flex-wrap gap-2">
            {block.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={!onSend || streaming}
                onClick={() => onSend?.(option)}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >{option}</button>
            ))}
          </div>
        </div>
      )}

      {block.type === "questionnaire" && (
        <Questionnaire
          artifactId={artifact.id}
          block={block}
          locale={locale}
          answers={viewState?.questionnaireAnswers}
          step={viewState?.questionnaireStep ?? 0}
          submitted={viewState?.questionnaireSubmitted ?? false}
          onAnswersChange={(questionnaireAnswers) => setArtifactViewState(artifact.id, { questionnaireAnswers })}
          onStepChange={(questionnaireStep) => setArtifactViewState(artifact.id, { questionnaireStep })}
          onSubmitted={() => setArtifactViewState(artifact.id, { questionnaireSubmitted: true })}
          onSend={onSend}
          disabled={streaming}
        />
      )}

      {block.type === "table" && block.note && (
        <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--fg-faint)]">{block.note}</p>
      )}
      {(block.type === "calculator" || block.type === "diagram") && block.note && (
        <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--fg-faint)]">{block.note}</p>
      )}
    </section>
  );
}

function Calculator({
  artifactId,
  block,
  locale,
  savedValues,
  onValuesChange,
}: {
  artifactId: string;
  block: Extract<GenUiBlock, { type: "calculator" | "diagram" }>;
  locale: "en" | "ru";
  savedValues?: Record<string, number>;
  onValuesChange: (values: Record<string, number>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const instanceId = useId();
  const values = useMemo(
    () => Object.fromEntries(block.fields.map((field) => {
      const saved = savedValues?.[field.id];
      const value = typeof saved === "number" && Number.isFinite(saved) ? saved : field.initial;
      return [field.id, clampCalculatorValue(field, value)];
    })),
    [artifactId, block.fields, savedValues],
  );
  const outputs = block.type === "calculator"
    ? [{ label: block.resultLabel, formula: block.formula, unit: block.unit }]
    : block.outputs;
  const numberFormat = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: block.precision,
  });

  const updateField = (id: string, nextValue: number, updateDraft: boolean) => {
    const field = block.fields.find((item) => item.id === id);
    if (!field || !Number.isFinite(nextValue)) return;
    const next = clampCalculatorValue(field, nextValue);
    onValuesChange({ ...values, [id]: next });
    if (updateDraft) setDrafts((current) => ({ ...current, [id]: String(next) }));
  };

  return (
    <div className="space-y-4 p-3">
      {block.type === "diagram" && <InteractiveDiagram block={block} values={values} locale={locale} />}
      <div className={`grid gap-4 ${block.fields.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {block.fields.map((field) => {
          const value = values[field.id] ?? field.initial;
          return (
            <div key={field.id} className="min-w-0 space-y-2">
              <label htmlFor={`${instanceId}-${field.id}`} className="block text-xs font-medium text-[var(--fg-muted)]">
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${instanceId}-${field.id}`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={drafts[field.id] ?? String(value)}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => {
                    const raw = event.currentTarget.value;
                    setDrafts((current) => ({ ...current, [field.id]: raw }));
                    if (raw.trim() !== "") updateField(field.id, Number(raw), false);
                  }}
                  onBlur={() => setDrafts((current) => {
                    const next = { ...current };
                    delete next[field.id];
                    return next;
                  })}
                  aria-label={field.label}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              {/* Every field has min/max/step, so each one gets a slider; the model's number/range hint only made them inconsistent. */}
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) => updateField(field.id, Number(event.currentTarget.value), true)}
                aria-label={`${field.label} slider`}
                className="block w-full accent-[var(--accent)]"
              />
            </div>
          );
        })}
      </div>
      <div className={block.type === "diagram" ? "grid gap-x-4 gap-y-2 sm:grid-cols-2" : "space-y-2"}>
      {outputs.map((item, index) => {
        const result = calculateFormula(item.formula, values);
        return <div key={index} className={block.type === "diagram"
          ? "flex min-w-0 items-center justify-between gap-3 border-t border-[var(--border)] py-2"
          : "flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-hover)]/70 px-3.5 py-3"}>
          <span className="text-sm text-[var(--fg-muted)]">{item.label}</span>
          <output aria-live="polite" className="text-right text-lg font-semibold tabular-nums text-[var(--fg)]">
            {result === null ? (locale === "ru" ? "Не определено" : "Undefined") : `${numberFormat.format(result)}${item.unit ? ` ${item.unit}` : ""}`}
          </output>
        </div>;
      })}
      </div>
    </div>
  );
}

function clampCalculatorValue(field: Extract<GenUiBlock, { type: "calculator" }>['fields'][number], value: number): number {
  const clamped = Math.max(field.min, Math.min(field.max, value));
  const snapped = field.min + Math.round((clamped - field.min) / field.step) * field.step;
  return Number(Math.max(field.min, Math.min(field.max, snapped)).toFixed(8));
}

type QuestionnaireAnswer = { selected: string[]; other: string };

function Questionnaire({
  artifactId,
  block,
  locale,
  answers,
  step,
  submitted,
  onAnswersChange,
  onStepChange,
  onSubmitted,
  onSend,
  disabled,
}: {
  artifactId: string;
  block: Extract<GenUiBlock, { type: "questionnaire" }>;
  locale: "en" | "ru";
  answers?: Record<string, QuestionnaireAnswer>;
  step: number;
  submitted: boolean;
  onAnswersChange: (answers: Record<string, QuestionnaireAnswer>) => void;
  onStepChange: (step: number) => void;
  onSubmitted: () => void;
  onSend?: (text: string) => void;
  disabled: boolean;
}) {
  const currentIndex = Math.min(Math.max(0, step), block.questions.length - 1);
  const question = block.questions[currentIndex]!;
  const answer = answers?.[question.id] ?? { selected: [], other: "" };
  const answersRef = useRef(answers ?? {});
  answersRef.current = answers ?? {};
  const isLast = currentIndex === block.questions.length - 1;
  const isRu = locale === "ru";
  const hasAnswer = question.mode === "text"
    ? answer.other.trim().length > 0
    : question.mode === "single"
      ? answer.selected.length === 1 || answer.other.trim().length > 0
      : answer.selected.length > 0 || answer.other.trim().length > 0;
  const canContinue = !question.required || hasAnswer;

  const updateAnswer = (next: QuestionnaireAnswer) => {
    const nextAnswers = { ...answersRef.current, [question.id]: next };
    answersRef.current = nextAnswers;
    onAnswersChange(nextAnswers);
  };

  const toggleOption = (option: string) => {
    if (question.mode === "single") {
      updateAnswer({ selected: [option], other: "" });
      return;
    }
    const selected = answer.selected.includes(option)
      ? answer.selected.filter((item) => item !== option)
      : [...answer.selected, option];
    updateAnswer({ ...answer, selected });
  };

  const continueFlow = () => {
    if (disabled || submitted || !canContinue) return;
    if (!isLast) {
      onStepChange(currentIndex + 1);
      return;
    }
    if (!onSend) return;
    const summary = block.questions.map((item, index) => {
      const value = answersRef.current[item.id] ?? (item.id === question.id ? answer : { selected: [], other: "" });
      const responses = item.mode === "multiple"
        ? [...value.selected, ...(value.other.trim() ? [value.other.trim()] : [])]
        : [value.other.trim() || value.selected[0] || (item.required ? "" : (isRu ? "Пропущено" : "Skipped"))].filter(Boolean);
      return `${index + 1}. ${item.prompt}\n${isRu ? "Ответ" : "Answer"}: ${responses.join(isRu ? ", " : ", ")}`;
    }).join("\n\n");
    onSubmitted();
    onSend(
      `${isRu ? "Это ответы на уточняющие вопросы к моей предыдущей задаче. Продолжи её выполнение с учётом ответов:" : "These are my answers to the clarification questions about my previous task. Continue it using these answers:"}\n\n${summary}`,
    );
  };

  if (submitted) {
    return (
      <div className="space-y-2 p-4" role="status" aria-live="polite">
        <p className="text-sm font-medium text-[var(--fg)]">{isRu ? "Ответы переданы Glow" : "Answers sent to Glow"}</p>
        <p className="text-xs text-[var(--fg-muted)]">{isRu ? "Продолжаю исходную задачу с учётом ваших ответов." : "Continuing the original task with your answers."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
          <span>{isRu ? `Вопрос ${currentIndex + 1} из ${block.questions.length}` : `Question ${currentIndex + 1} of ${block.questions.length}`}</span>
          <span>{question.required ? (isRu ? "Обязательный" : "Required") : (isRu ? "Можно пропустить" : "Optional")}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]" role="progressbar" aria-valuemin={1} aria-valuemax={block.questions.length} aria-valuenow={currentIndex + 1} aria-label={isRu ? "Прогресс уточнений" : "Clarification progress"}>
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${((currentIndex + 1) / block.questions.length) * 100}%` }} />
        </div>
      </div>

      <fieldset className="min-w-0 space-y-3" disabled={disabled}>
        <legend className="mb-3 text-sm font-medium leading-relaxed text-[var(--fg)]">{question.prompt}</legend>
        {question.options?.map((option) => {
          const checked = answer.selected.includes(option);
          return (
            <label key={option} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--fg)] transition-colors hover:bg-[var(--bg-hover)]">
              <input
                type={question.mode === "single" ? "radio" : "checkbox"}
                name={`${artifactId}-${question.id}`}
                value={option}
                checked={checked}
                onChange={() => toggleOption(option)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span className="min-w-0">{option}</span>
            </label>
          );
        })}
        <label htmlFor={`${artifactId}-${question.id}-other`} className="block text-xs font-medium text-[var(--fg-muted)]">
          {question.mode === "text"
            ? (isRu ? "Ваш ответ" : "Your answer")
            : (isRu ? "Свой вариант (необязательно)" : "Your own answer (optional)")}
        </label>
        <textarea
          id={`${artifactId}-${question.id}-other`}
          rows={question.mode === "text" ? 3 : 2}
          maxLength={500}
          value={answer.other}
          onChange={(event) => updateAnswer({ ...answer, other: event.currentTarget.value })}
          placeholder={isRu ? "Напишите своими словами…" : "Write your answer…"}
          className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--accent)]"
        />
        {question.mode === "multiple" && (
          <p className="text-xs text-[var(--fg-faint)]">{isRu ? "Можно выбрать несколько вариантов." : "Select all that apply."}</p>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={() => onStepChange(Math.max(0, currentIndex - 1))}
          disabled={disabled || currentIndex === 0}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] disabled:invisible"
        ><ChevronLeft size={16} />{isRu ? "Назад" : "Back"}</button>
        <button
          type="button"
          onClick={continueFlow}
          disabled={disabled || !canContinue || (isLast && !onSend)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >{isLast ? (isRu ? "Продолжить задачу" : "Continue task") : (isRu ? "Далее" : "Next")}<ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function Chart({ block, chartType, locale }: { block: Extract<NonNullable<ReturnType<typeof validateGenUiBlock>>, { type: "chart" }>; chartType: "bar" | "line"; locale: "en" | "ru" }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(640);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportWidth(Math.max(280, viewport.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(0, ...block.values);
  const min = Math.min(0, ...block.values);
  const span = max - min || 1;
  const numberFormat = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 2,
  });
  const labelWidth = Math.max(
    64,
    ...block.labels.map((label, index) => Math.max(label.length * 7, numberFormat.format(block.values[index]).length * 7) + 20),
  );
  const width = Math.max(viewportWidth, block.labels.length * labelWidth + 56);
  const height = 236;
  const left = 44;
  const right = 12;
  const top = 28;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index: number) => left + (block.values.length === 1 ? plotWidth / 2 : index * plotWidth / (block.values.length - 1));
  const y = (value: number) => top + ((max - value) / span) * plotHeight;
  const zeroY = y(0);

  const accessibleValues = block.labels
    .map((label, index) => `${label}: ${numberFormat.format(block.values[index])}`)
    .join(", ");

  return (
    <div ref={viewportRef} className="w-full overflow-x-auto" role="img" aria-label={`${block.title}. ${accessibleValues}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto max-h-[320px] max-w-none" style={{ width: `${width}px` }} preserveAspectRatio="xMidYMid meet">
        <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="var(--border)" />
        {chartType === "bar" ? block.values.map((value, index) => {
          const slot = plotWidth / block.values.length;
          const barWidth = Math.max(4, slot * 0.58);
          const barX = left + index * slot + (slot - barWidth) / 2;
          const valueY = y(value);
          return (
            <g key={`${block.labels[index]}-${index}`}>
              <rect x={barX} y={Math.min(valueY, zeroY)} width={barWidth} height={Math.max(1, Math.abs(zeroY - valueY))} rx="4" fill="var(--accent)" />
              <title>{`${block.labels[index]}: ${value}`}</title>
              <text x={barX + barWidth / 2} y={value >= 0 ? Math.max(14, valueY - 8) : Math.min(height - bottom - 2, valueY + 16)} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--fg)">{numberFormat.format(value)}</text>
              <text x={barX + barWidth / 2} y={height - 18} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{block.labels[index]}</text>
            </g>
          );
        }) : (
          <>
            <polyline points={block.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {block.values.map((value, index) => (
              <g key={`${block.labels[index]}-${index}`}>
              <circle cx={x(index)} cy={y(value)} r="4" fill="var(--accent)" />
              <title>{`${block.labels[index]}: ${value}`}</title>
              <text x={x(index)} y={Math.max(14, y(value) - 10)} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--fg)">{numberFormat.format(value)}</text>
              <text x={x(index)} y={height - 18} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{block.labels[index]}</text>
              </g>
            ))}
          </>
        )}
        <text x="8" y="18" fontSize="11" fill="var(--fg-faint)">{numberFormat.format(max)}</text>
      </svg>
    </div>
  );
}
