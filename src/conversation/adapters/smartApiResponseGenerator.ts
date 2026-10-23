import { buildChatPayload, streamChatCompletion, type ChatMessage } from "../../lib/llm/smartapi";
import type { ResponseGenerator } from "../contracts";
import { BUILTIN_SKILLS, skillInstructions } from "../../lib/skills";
import { useSkillsStore } from "../../stores/skillsStore";
import { splitSearchSources } from "../../lib/searchSources";
import { WORKSPACE_TOOL_DEFINITIONS } from "../../lib/workspaceTools";
import { listWorkspaceFiles, readWorkspaceFile } from "../../lib/workspace";
import { prepareAttachment } from "../../lib/attachments";
import { redactPii } from "../../lib/tauri";
import type { Locale } from "../../lib/i18n";
import { runAgent } from "../../lib/agent/loop";
import { createToolExecutor } from "../../lib/agent/tools";
import { appendAgentTrace } from "../../lib/agent/trace";
import type { AgentMode, Autonomy } from "../../lib/agent/policy";
import { useAgentStore } from "../../stores/agentStore";
import {
  clarifyPrompt, courseworkRequestBefore, formatQuestions, generateCoursework, isAwaitingCourseworkAnswer,
  isCourseworkRequest, parseClarification,
} from "../../lib/coursework";

/**
 * Transitional adapter for the existing SmartAPI integration.
 * Provider-specific payload construction stays outside ConversationEngine.
 */
export type LegacyGenerationOptions = {
  mode: "home" | "code" | "med";
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemExtra: string;
  memory: string[];
  designMode: boolean;
  webSearch: boolean;
  /** The model may search when it judges fresh or external facts are needed. */
  webAuto?: boolean;
  locale: Locale;
  workspaceTools?: boolean;
  agentPlan?: boolean;
  /** Glow Code: run the tool-using agent loop on the selected project folder. */
  agent?: { mode: AgentMode; autonomy: Autonomy; taskId: string };
  onAgentStatus?: (status: string) => void;
};

/** A full HTML page or a long document does not fit the default 4096-token answer and gets cut off mid-file. */
const BUILD_REQUEST = /html|сайт|веб-?страниц|лендинг|мини-?игр|игр[уаые]|сап[её]р|морской бой|приложени|калькулятор|\bgame\b|\bapp\b/i;
function outputBudget(generation: { mode: string; designMode: boolean; maxTokens: number }, request = ""): number {
  return generation.mode === "code" || generation.designMode || BUILD_REQUEST.test(request) ? Math.max(generation.maxTokens, 12000) : generation.maxTokens;
}

export const smartApiResponseGenerator: ResponseGenerator<LegacyGenerationOptions> = {
  async stream({ history, generation }, callbacks, signal) {
    const currentText = history.filter(message => message.role === "user").at(-1)?.content || "";
    const webTools = generation.webSearch || (generation.webAuto === true && generation.mode !== "med");
    const answeringCoursework = isAwaitingCourseworkAnswer(history);
    if (generation.mode === "code" && !generation.agentPlan && (answeringCoursework || isCourseworkRequest(currentText))) {
      // Coursework is built chapter by chapter, then returned as one docx glow-file.
      let usageTotal = { inputTokens: 0, outputTokens: 0, costUnits: 0 };
      const complete = async (messages: { role: "system" | "user"; content: string }[], maxTokens: number) => {
        let text = "";
        let streamError: Error | undefined;
        await streamChatCompletion(generation.modelId, messages, {
          onToken: (token) => { text += token; },
          onDone: (usage) => {
            usageTotal = { inputTokens: usageTotal.inputTokens + usage.inputTokens, outputTokens: usageTotal.outputTokens + usage.outputTokens, costUnits: usageTotal.costUnits + usage.costUnits };
          },
          onError: (error) => { streamError = error; },
        }, signal, { temperature: generation.temperature, maxTokens, conversationId: history.at(-1)?.conversation_id, scope: generation.mode, webSearch: false });
        if (streamError) throw streamError;
        return text;
      };
      // First request: the model may ask questions and stop. The user's reply then starts the build.
      const request = answeringCoursework ? courseworkRequestBefore(history) : currentText;
      const skipped = /^пропустить$/i.test(currentText.trim());
      const topic = answeringCoursework && !skipped ? `${request}\nДополнения пользователя: ${currentText}` : request;
      if (!answeringCoursework) {
        const clarification = parseClarification(await complete(clarifyPrompt(topic), 800));
        if (!clarification.ready) {
          callbacks.onToken(formatQuestions(clarification.questions));
          callbacks.onDone(usageTotal);
          return;
        }
      }
      const course = await generateCoursework(topic, { complete, onStatus: generation.onAgentStatus, signal });
      const file = JSON.stringify({ format: "docx", filename: `${course.title}.docx`, title: course.title, content: course.markdown });
      callbacks.onToken(`Курсовая «${course.title}» готова. Файл ниже. Список литературы составлен моделью: проверьте каждый источник перед сдачей.\n\n\`\`\`glow-file\n${file}\n\`\`\``);
      callbacks.onDone(usageTotal);
      return;
    }
    const workflow = skillInstructions(currentText, [...BUILTIN_SKILLS, ...useSkillsStore.getState().custom]);
    const cleanHistory = history.map(message => message.role === "assistant"
      ? { ...message, content: splitSearchSources(message.content).text }
      : message);
    if (generation.agent) {
      const { mode, autonomy, taskId } = generation.agent;
      const tools = createToolExecutor(taskId);
      const agentPayload = buildChatPayload(generation.mode, cleanHistory, [generation.systemExtra, workflow].filter(Boolean).join("\n\n"), generation.memory, false, generation.modelId, generation.designMode, false, mode === "plan");
      const store = () => useAgentStore.getState();
      store().begin();
      try {
        const result = await runAgent(agentPayload, {
          async turn(messages, toolSet, onToken) {
            let calls: { id: string; name: string; arguments: string }[] = [];
            let usage: { inputTokens: number; outputTokens: number; costUnits: number } | undefined;
            let streamError: Error | undefined;
            await streamChatCompletion(generation.modelId, messages, {
              onToken,
              onDone: (done) => { usage = done; },
              onError: (error) => { streamError = error; },
              onToolCalls: (next) => { calls = next; },
            }, signal, { temperature: generation.temperature, maxTokens: 8000, conversationId: history.at(-1)?.conversation_id, scope: generation.mode, webSearch: false, toolSet });
            if (streamError) throw streamError;
            return { calls, usage };
          },
          exec: tools.exec,
          classifyCommand: tools.classifyCommand,
          confirm: (request) => store().ask(request),
          drainExtraMessages: tools.drainExtraMessages,
          onToken: callbacks.onToken,
          onStep: (step) => { store().upsertStep(step); if (step.status === "running") generation.onAgentStatus?.(step.summary); },
          onTasks: (next) => store().setTasks(next),
        }, { mode, autonomy, signal });
        const notice = result.stopped === "max_turns" ? "Остановлено: достигнут лимит шагов. Напишите «продолжай», чтобы продолжить."
          : result.stopped === "budget" ? "Остановлено: исчерпан бюджет токенов задачи. Напишите «продолжай», чтобы продолжить." : "";
        callbacks.onToken(`${notice ? `\n\n_${notice}_` : ""}${appendAgentTrace("", { v: 1, taskId, stopped: result.stopped, steps: result.steps, tasks: result.tasks, changedFiles: result.changedFiles })}`);
        if (result.stopped === "error") throw new Error(result.error || "Агент остановился из-за ошибки.");
        callbacks.onDone(result.usage);
      } finally {
        store().finish();
      }
      return;
    }
    const initialPayload = buildChatPayload(
      generation.mode,
      cleanHistory,
      [generation.systemExtra, workflow].filter(Boolean).join("\n\n"),
      generation.memory,
      false,
      generation.modelId,
      generation.designMode,
      webTools,
      generation.agentPlan,
    );
    let payload: ChatMessage[] = initialPayload;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUnits = 0;
    let readChars = 0;
    let imageCount = 0;
    const readPaths = new Set<string>();
    const safeTools: string[] = generation.workspaceTools ? WORKSPACE_TOOL_DEFINITIONS.map((tool) => tool.function.name) : [];
    for (let turn = 0; turn < 8; turn++) {
      if (signal.aborted) return;
      let calls: { id: string; name: string; arguments: string }[] = [];
      let turnUsage: { inputTokens: number; outputTokens: number; costUnits: number } | undefined;
      let streamError: Error | undefined;
      await streamChatCompletion(generation.modelId, payload, {
        onToken: callbacks.onToken,
        onDone: (usage) => { turnUsage = usage; },
        onError: (error) => { streamError = error; },
        onToolCalls: (next) => { calls = next; },
      }, signal, {
        temperature: generation.temperature,
        maxTokens: outputBudget(generation, currentText),
        conversationId: history.at(-1)?.conversation_id,
        scope: generation.mode,
        webSearch: webTools,
        workspaceTools: generation.workspaceTools,
      });
      if (streamError) throw streamError;
      if (turnUsage) {
        inputTokens += turnUsage.inputTokens;
        outputTokens += turnUsage.outputTokens;
        costUnits += turnUsage.costUnits;
      }
      if (!calls.length) {
        callbacks.onDone({ inputTokens, outputTokens, costUnits });
        return;
      }
      if (!generation.workspaceTools) throw new Error("Модель запросила недоступный инструмент.");
      if (calls.length > 4 || calls.some((call) => !call.id || call.id.length > 160) || new Set(calls.map((call) => call.id)).size !== calls.length) throw new Error("Модель запросила действие, которое Glow не разрешает.");
      payload.push({ role: "assistant", content: null, tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) });

      const imagesForTurn: ChatMessage[] = [];
      for (const call of calls) {
        if (signal.aborted) return;
        if (!safeTools.includes(call.name)) {
          payload.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify({ error: "This tool is unavailable and was not executed. Only workspace_list_files and workspace_read_file exist. To create a file in Work mode, return the complete glow-file JSON block using the supplied schema; Glow exports and saves it after the answer. In Plan mode, return a plan only." }) });
          continue;
        }
        let args: Record<string, unknown>;
        try { args = JSON.parse(call.arguments); }
        catch { payload.push({ role: "tool", tool_call_id: call.id, name: call.name, content: "Ошибка: аргументы инструмента имеют неверный формат." }); continue; }
        let result: unknown;
        try {
          if (call.name === "workspace_list_files") {
            generation.onAgentStatus?.(generation.locale === "ru" ? "Просматриваю рабочую папку…" : "Reviewing the workspace…");
            const entries = await listWorkspaceFiles();
            result = { files: entries.map(({ name, relative_path, is_dir, size }) => ({ name, relative_path, is_dir, size })), truncated: entries.length >= 300 };
            generation.onAgentStatus?.(generation.locale === "ru" ? `Нашёл файлов: ${entries.filter((entry) => !entry.is_dir).length}` : `Found ${entries.filter((entry) => !entry.is_dir).length} files`);
          } else if (call.name === "workspace_read_file") {
            const path = args.relative_path;
            if (typeof path !== "string" || path.length > 500) throw new Error("Glow получил недопустимое имя файла.");
            if (readPaths.has(path)) throw new Error("Этот файл уже прочитан в текущей задаче.");
            readPaths.add(path);
            generation.onAgentStatus?.(generation.locale === "ru" ? `Читаю · ${path}` : `Reading · ${path}`);
            const bytes = await readWorkspaceFile(path);
            const file = new File([bytes], path.replace(/[\\/]/g, " · "), { type: "application/octet-stream" });
            const items = await prepareAttachment(file, "ru");
            let text = items.filter((item) => item.text).map((item) => item.text).join("\n\n");
            if (generation.mode === "med") text = (await redactPii(text)).text;
            readChars += text.length;
            const images = items.filter((item) => item.image);
            if (generation.mode === "med" && images.length) throw new Error(generation.locale === "ru" ? "Режим Med не передаёт изображения рабочей папки, чтобы не отправлять неотредактированные персональные данные. Используйте обезличенную копию." : "Med mode does not send workspace images to avoid sharing unredacted personal data. Use a redacted copy.");
            imageCount += images.length;
            if (imageCount > 4) throw new Error("В задаче можно обработать до четырёх изображений. Уточните, какие файлы важны.");
            result = { path, content: text || "В документе нет извлекаемого текста. Изображение будет передано модели отдельно.", images: images.map((item) => item.name) };
            for (const image of images) {
              imagesForTurn.push({ role: "user", content: [
                { type: "text", text: `Изображение из файла рабочей папки: ${image.name}` },
                { type: "image_url", image_url: { url: image.image! } },
              ] });
            }
          } else {
            throw new Error("Инструмент не найден.");
          }
        } catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        payload.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(result).slice(0, 120000) });
      }
      payload.push(...imagesForTurn);
    }
    throw new Error("Glow остановил задачу после восьми шагов. Уточните запрос и продолжите в этом чате.");
  },
};
