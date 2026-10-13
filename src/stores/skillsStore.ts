import { create } from "zustand";
import { accountStorage } from "../auth/accountStorage";
import { BUILTIN_SKILLS, parseSkillMarkdown, type Skill } from "../lib/skills";

const key = "glow.skills";
function load(): Skill[] {
  try {
    const sources: unknown = JSON.parse(accountStorage.getItem(key) || "[]");
    if (!Array.isArray(sources)) return [];
    return sources.slice(0, 30).flatMap(source => {
      try { return typeof source === "string" ? [parseSkillMarkdown(source)] : []; } catch { return []; }
    }).filter(skill => !BUILTIN_SKILLS.some(item => item.id === skill.id));
  } catch { return []; }
}
interface SkillsState {
  custom: Skill[];
  importSkill: (source: string) => void;
  removeSkill: (id: string) => void;
}
export const useSkillsStore = create<SkillsState>((set, get) => ({
  custom: load(),
  importSkill: source => {
    const skill = parseSkillMarkdown(source);
    if (BUILTIN_SKILLS.some(item => item.id === skill.id)) throw new Error("Имя занято встроенным навыком.");
    const custom = [...get().custom.filter(item => item.id !== skill.id), skill];
    if (custom.length > 30) throw new Error("Максимум 30 пользовательских навыков.");
    accountStorage.setItem(key, JSON.stringify(custom.map(item => item.source)));
    set({ custom });
  },
  removeSkill: id => {
    const custom = get().custom.filter(item => item.id !== id);
    accountStorage.setItem(key, JSON.stringify(custom.map(item => item.source)));
    set({ custom });
  },
}));
