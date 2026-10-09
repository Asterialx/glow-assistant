export interface StudyTask { id: string; title: string; description?: string; minutes?: number }
export interface StudyTopic { id: string; title: string; tasks: StudyTask[] }
export interface StudyDay { id: string; title: string; topics: StudyTopic[] }
export interface StudyPlanBlock { type: "study_plan"; title: string; days: StudyDay[]; note?: string }

/** Output-format hint only; this does not generate or invent any plan content. */
export function isStudyPlanRequest(text: string): boolean {
  const learning = /подготовк|учеб|учёб|обучен|изучен|экзамен|контрольн|study|learning|exam|revision/i.test(text);
  const planning = /план|расписан|подготовь|подготовить|plan|schedule|prepare/i.test(text);
  return learning && planning;
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
const id = (value: unknown) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(value) ? value : null;

export function validateStudyPlan(value: unknown): StudyPlanBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const title = text(raw.title, 240);
  const note = raw.note == null || raw.note === "" ? undefined : text(raw.note, 500);
  if (raw.type !== "study_plan" || !title || note === null || !Array.isArray(raw.days) || raw.days.length < 1 || raw.days.length > 30) return null;
  const days: StudyDay[] = [], dayIds = new Set<string>();
  let total = 0;
  for (const day of raw.days) {
    if (!day || typeof day !== "object" || Array.isArray(day)) return null;
    const dayId = id(day.id), dayTitle = text(day.title, 160);
    if (!dayId || dayIds.has(dayId) || !dayTitle || !Array.isArray(day.topics) || day.topics.length < 1 || day.topics.length > 6) return null;
    dayIds.add(dayId);
    const topics: StudyTopic[] = [], topicIds = new Set<string>();
    for (const topic of day.topics) {
      if (!topic || typeof topic !== "object" || Array.isArray(topic)) return null;
      const topicId = id(topic.id), topicTitle = text(topic.title, 160);
      if (!topicId || topicIds.has(topicId) || !topicTitle || !Array.isArray(topic.tasks) || topic.tasks.length < 1 || topic.tasks.length > 8) return null;
      topicIds.add(topicId);
      const tasks: StudyTask[] = [], taskIds = new Set<string>();
      for (const task of topic.tasks) {
        if (!task || typeof task !== "object" || Array.isArray(task)) return null;
        const taskId = id(task.id), taskTitle = text(task.title, 240);
        const description = task.description == null || task.description === "" ? undefined : text(task.description, 800);
        const minutes = task.minutes;
        if (!taskId || taskIds.has(taskId) || !taskTitle || description === null ||
          (minutes != null && (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 240))) return null;
        taskIds.add(taskId);
        if (++total > 120) return null;
        tasks.push({ id: taskId, title: taskTitle, ...(description ? { description } : {}), ...(minutes != null ? { minutes } : {}) });
      }
      topics.push({ id: topicId, title: topicTitle, tasks });
    }
    days.push({ id: dayId, title: dayTitle, topics });
  }
  return { type: "study_plan", title, days, ...(note ? { note } : {}) };
}

/** Keep marks on unchanged tasks, but not on a replacement reusing the same IDs. */
export function studyTaskKey(day: StudyDay, topic: StudyTopic, task: StudyTask): string {
  let hash = 2166136261;
  for (const char of `${task.title}\n${task.description ?? ""}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${day.id}/${topic.id}/${task.id}/${hash >>> 0}`;
}

export function studyTaskKeys(block: StudyPlanBlock): string[] {
  return block.days.flatMap((day) => day.topics.flatMap((topic) => topic.tasks.map((task) => studyTaskKey(day, topic, task))));
}

export function studyProgress(keys: string[], completed: Record<string, boolean>) {
  const done = keys.filter((key) => completed[key] === true).length;
  return { done, total: keys.length, percent: keys.length ? Math.round(done / keys.length * 100) : 0 };
}

export function setStudyCompletion(allKeys: string[], completed: Record<string, boolean>, targetKeys: string[], checked: boolean): Record<string, boolean> {
  const targets = new Set(targetKeys);
  return Object.fromEntries(allKeys.filter((key) => targets.has(key) ? checked : completed[key] === true).map((key) => [key, true]));
}

export function validateStudyCompletion(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value).slice(0, 120).filter(([key, done]) => key.length <= 120 && /^[A-Za-z0-9_/-]+$/.test(key) && done === true));
}
