export function validateProfile(name: string, age: string): { display_name: string; age: number | null; onboarding_completed: true } {
  const display_name = name.trim();
  if (!display_name || display_name.length > 60) throw new Error("Введите имя длиной от 1 до 60 символов.");
  const value = age.trim() ? Number(age) : null;
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 120)) throw new Error("Укажите возраст от 1 до 120 лет или оставьте поле пустым.");
  return { display_name, age: value, onboarding_completed: true };
}
