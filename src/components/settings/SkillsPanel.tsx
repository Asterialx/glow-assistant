import { useState } from "react";
import { BUILTIN_SKILLS } from "../../lib/skills";
import { useSkillsStore } from "../../stores/skillsStore";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";

export function SkillsPanel() {
  const { custom, importSkill, removeSkill } = useSkillsStore();
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const ru = useUiStore(s => s.locale) === "ru";
  const label = (en: string, ruText: string) => ru ? ruText : en;
  const add = (text: string) => {
    try { importSkill(text); setSource(""); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Skills</h2>
    <p className="text-sm text-[var(--fg-muted)]">{label("Reusable workflows applied to the next request. Import a self-contained SKILL.md in the Agent Skills format used by Claude. Scripts and additional resources are not supported yet.", "Повторяемые сценарии для следующего запроса. Можно импортировать самостоятельный SKILL.md в формате Agent Skills, который использует Claude. Скрипты и дополнительные файлы пока не поддерживаются.")}</p>
    {[...BUILTIN_SKILLS, ...custom].map(skill => <div key={skill.id} className="rounded-xl border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center gap-2"><strong className="flex-1 text-sm">{skill.name}</strong>
        <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm" onClick={() => {
          const chat = useChatStore.getState();
          chat.setDraft(`/skill ${skill.id}\n${chat.draft.replace(/^\/skill[^\n]*\n?/, "")}`);
          useUiStore.getState().setSettingsOpen(false);
        }}>{label("Use", "Применить")}</button>
        {skill.source && <button className="text-xs text-[var(--fg-muted)]" onClick={() => removeSkill(skill.id)}>{label("Remove from library", "Убрать из библиотеки")}</button>}
      </div><p className="mt-1 text-xs text-[var(--fg-muted)]">{skill.description}</p>
    </div>)}
    <label className="block text-sm">{label("Import SKILL.md", "Импортировать SKILL.md")}
      <input type="file" accept=".md,text/markdown,text/plain" className="mt-2 block w-full text-xs" onChange={async e => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (file) { if (file.size > 96000) setError("Файл слишком большой."); else { try { add(await file.text()); } catch { setError("Не удалось прочитать файл."); } } }
        input.value = "";
      }} />
    </label>
    <textarea aria-label="SKILL.md" placeholder="---&#10;name: my-skill&#10;description: My workflow&#10;---&#10;Instructions…" value={source} onChange={e => setSource(e.target.value)} className="h-36 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm" />
    <button disabled={!source.trim()} onClick={() => add(source)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">{label("Save skill", "Сохранить навык")}</button>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <p className="text-xs text-[var(--fg-muted)]">{label("Your library is stored on this device. Official Claude document skills require a separate execution service.", "Библиотека хранится на этом устройстве. Официальные навыки Claude для документов требуют отдельного сервиса выполнения.")}</p>
  </section>;
}
