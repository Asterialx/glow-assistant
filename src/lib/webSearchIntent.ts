const WEB_CUES = /\b(?:search(?: the)? web|search online|look up|browse|find online|check online|google it|latest|current(?:ly)?|today|tonight|yesterday|this week|this month|recent(?:ly)?|breaking|news|weather|price|stock|exchange rate|version|release|score|schedule|who is the (?:current|latest)|newest|up to date|president|prime minister|ceo|stock price|near me|where to buy)\b|(?:поищи(?:те)?\s+в\s+интернет\w*|найди(?:те)?\s+в\s+интернет\w*|загугли(?:те)?|поиск\s+в\s+интернет\w*|проверь(?:те)?\s+в\s+сет\w*|последн\w*|свеж\w*|актуальн\w*|сегодня|вчера|сейчас|недавн\w*|новост\w*|курс\s+валют|котировк\w*|цен\w*\s+(?:на|акци)|погод\w*|расписани\w*|обновлен\w*|релиз\w*|верси\w*|кто\s+(?:сейчас|ныне)\s+(?:президент|директор|генеральный)|результат\w*\s+(?:матч|игр)|рядом\s+со\s+мной|где\s+купить|найди\s+источник)/iu;

const MEDICAL_CUES = /\b(?:medical|medicine|medication|drug|treatment|clinical|healthcare|disease|diagnosis|symptom|side effects|clinical trial|clinical study|medical research|guideline|pubmed|doi|randomized|randomised|meta-analysis|peer-reviewed)\b|(?:медицин\w*|лекарств\w*|препарат\w*|лечени\w*|терапи\w*|симптом\w*|диагноз\w*|побочн\w*\s+эффект\w*|клиническ\w*|заболеван\w*|здоровь\w*|доказательн\w*|гайдлайн\w*|руководств\w*|пубмед|pubmed|doi|рандомизирован\w*|мета-анализ)/iu;

const EXPLICIT_RESEARCH = /\b(?:papers?|studies|research|sources|citations|journal articles?|scientific literature)\b|(?:научн\w*\s+работ\w*|источник\w*|литератур\w*\s+обзор|научн\w*\s+данн\w*)/iu;
const EXPLICIT_LOOKUP = /\b(?:search|look up|browse|check online|verify online|find online)\b|(?:поищи\s+в\s+интернет\w*|найди\s+в\s+интернет\w*|проверь\s+в\s+сети)/iu;
const WEBSITE_REFERENCE = /(?:https?:\/\/|\bwww\.)\S+|\b[a-z\d-]+\.(?:com|org|net|gov|edu|io|ai|ru|uk|de|fr|jp|pubmed)\b/i;

/** Search for changing facts, cited research and explicit requests to look things up. */
export function shouldSearchWeb(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return WEB_CUES.test(value) || MEDICAL_CUES.test(value) || EXPLICIT_RESEARCH.test(value) || EXPLICIT_LOOKUP.test(value) || WEBSITE_REFERENCE.test(value);
}
