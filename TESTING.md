# Glow Assistant — как всё тестировать

Запуск: `npm run tauri:dev` (рекомендуется) или `npm run dev` (данные в памяти, без Game Mode/FS Rust).

Нужен валидный `VITE_SMARTAPI_KEY` в `.env` для чата.

**Agents / Billing / Study / Med tools** — Settings (шестерёнка / профиль):
- Billing
- Desktop app → Agents & MCP
- Desktop app → Study & Focus
- Desktop app → Med tools

Плашки Chat/Study/Agents в шапке больше нет.

---

## Готовые запросы для теста каждой фичи

Копируй текст **как есть** в новый чат (Home / Code / Med — где указано).

### Artifacts — HTML iframe
```
Сделай кликабельный HTML-прототип с кнопкой «Нажми меня».
В чате не пиши исходник — только коротко «собираю…», потом HTML в одном блоке ```html, и в конце «готово».
```

**Ожидание:** в чате нет сырого HTML (статус «Собираю артефакт…»), справа открывается Artifacts, под ответом кнопка «Открыть артефакт».

---

### Artifacts — Code
```
Покажи алгоритм бинарного поиска на TypeScript. Код ОБЯЗАТЕЛЬНО в блоке:

```ts
export function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid]! < target) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}
```

Без других code-блоков.
```

**Ожидание:** вкладка Code в Artifacts.

---

### Artifacts — Jupyter (Pyodide)
```
Верни ровно один блок:

```jupyter
print("Glow Jupyter OK")
print(sum(range(1, 11)))
for i in range(3):
    print("tick", i)
```
```

**Ожидание:** Artifacts → Jupyter → **Run cell (Pyodide)** → вывод `55` и tick’и. Первый раз качает Pyodide (нужен интернет).

---

### Inline UI — Checklist (в чате, НЕ Artifacts)
```
Сделай чеклист покупок. Используй ровно такой блок (без markdown - [ ]):

```widget
{"type":"checklist","items":[{"text":"Молоко","done":false},{"text":"Хлеб","done":false},{"text":"Открыть Glow","done":true}]}
```
```

**Ожидание:** интерактивный чеклист **внутри сообщения** в чате. Панель Artifacts справа **не** открывается. Галочки пишутся в SQLite `ui_widgets`.

---

### Inline UI — Progress bar
```
Только виджет:

```widget
{"type":"progress","label":"Подготовка к IELTS","value":65}
```
```

**Ожидание:** прогресс-бар в чате, не Artifacts.

---

### Inline UI — Flashcards (SRS)
```
```widget
{"type":"flashcard","front":"Big-O бинарного поиска?","back":"O(log n)"}
```
```

**Ожидание:** карточка в чате; клик переворачивает; `flipped` в БД.

---

### Ветвление (edit message)
1. Отправь: `Назови три идеи ужина`
2. Дождись ответа
3. Наведи на **своё** сообщение → карандаш → замени на: `Назови три идеи завтрака` → Save  

**Ожидание:** новый ответ про завтрак (новая ветка).

---

### Модель + temperature / max_tokens
1. Открой селектор модели → поставь Temperature `0.1`, Max tokens `1024`
2. Запрос:
```
Напиши одно короткое предложение: кто ты? Назови своё имя модели.
```
3. Смени модель (например Opus ↔ Sonnet) и повтори тот же вопрос.

**Ожидание:** представляется как выбранная модель, не «семейный помощник Glow».

---

### Голос → текст (dictation / mic)
- **Волны:** нажми → говори → Stop → сообщение уходит в чат.
- **Mic:** запись → точки громкости → ✓  
  Скажи: «Напомни купить хлеб завтра»  
**Ожидание:** `[Voice message]` + расшифровка; ИИ отвечает по смыслу.

---

### DnD файлы
| Файл | Что сделать | Ожидание |
|------|-------------|----------|
| `.pdf` | Перетащи в инпут + «Кратко суммаризируй вложение» | Артефакт PDF + ответ по тексту |
| `.txt` / `.md` | То же | Code/text artifact |
| `.stl` / `.obj` | Перетащи | 3D viewer в Artifacts (не torus) |
| `.dcm` | Перетащи | DICOM viewer |
| картинка | Перетащи + «Что во вложении?» | Метаданные в контексте (полный vision — если модель умеет) |

---

### Memory
```
Remember: меня зовут Тестер, люблю матча-латте и учу алгоритмы.
Подтверди, что запомнил, одной фразой.
```
Потом **New chat**:
```
Как меня зовут и что я люблю пить?
```
**Ожидание:** вспомнит факты (если Game Mode выключен).

---

### Projects
1. Сайдбар → Projects → создай `Demo Project`
2. Меню чата ⋯ → Add to project → Demo Project
3. В чате:
```
В этом проекте отвечай очень кратко, максимум 2 предложения. Ок?
```

---

### Billing
Settings → **Billing** (после 2–3 ответов чата) — таблица/график токенов.

---

### Agents & MCP / Game Mode
Settings → Desktop → **Agents & MCP**
- Force Game Mode on → бейдж в шапке
- Path `C:\` → List (только Tauri)
- `echo Glow` в терминале

---

### Study & Focus
Settings → **Study & Focus**
- Front: `O(1)` Back: `константное время` → Add card
- Pomodoro Start
- Design & Reflect → HTML в Artifacts

---

### Med — Biomarker table (inline, НЕ Artifacts)
Режим **Med**, затем:
```
Покажи панель анализов. Только ```widget type biomarker_table (без HTML):

Glucose 6.2 mmol/L (3.9–5.5), LDL 3.8 mmol/L (0–3.0), HDL 1.1 mmol/L (1.0–99), HbA1c 5.1 % (4.0–5.6), CRP 8 mg/L (0–5).
```

**Ожидание:** таблица **в чате**, красным OUT-значения, кнопка «Сгенерировать PDF-отчет». Панель Artifacts не открывается.

---

### Med
1. Режим **Med** в сайдбаре  
2. Settings → **Med tools**  
3. В чате (med):
```
Пациент Jane Doe, email jane@clinic.org. Кратко: что сделаешь с PII перед анализом?
```
**Ожидание:** PII вырезается / модель видит redact.

Биомаркеры в Med tools: Parse готовый TSV или Upload PDF → Parse → таблица + график.  
Drugs: `warfarin, vitamin K` → Check.  
Protocol → Print / Save PDF.

---

## Комбо-запрос (сразу несколько фич)
```
Кратко опиши план, затем:

```widget
[
  {"type":"checklist","items":[{"text":"A","done":false},{"text":"B","done":true},{"text":"C","done":false}]},
  {"type":"progress","label":"Демо фич","value":80},
  {"type":"flashcard","front":"HTTP 404?","back":"Not Found"}
]
```

И отдельно один ```html с заголовком Combo test и кнопкой.
```

**Ожидание:** виджеты в чате (не Artifacts) + HTML справа в Artifacts.

---

## 1. Интерфейс и контент

| Что | Как проверить |
|-----|----------------|
| Стриминг + Markdown | Спросите: «объясни сортировку пузырьком, таблица Big-O и формула $O(n^2)$» — должен идти поток, таблица и LaTeX. |
| Artifacts HTML | «Сгенерируй ```html страницу с кнопкой» — справа откроется iframe. |
| Artifacts code | Любой ```python/ts блок → вкладка Code. |
| Artifacts 3D | Перетащите `.stl` / `.obj` в чат — панель с вращающейся моделью (не torus). |
| Jupyter | Study → Create Jupyter / или ```jupyter ячейка → Artifacts → **Run cell (Pyodide)** → вывод `print`. Первый запуск качает Pyodide (~сеть). |
| DICOM | Перетащите `.dcm` → Artifacts показывает метаданные/пиксели если файл читается. |
| Checklist | Ответ с `- [ ] task` и `- [x] done` → кликабельный чеклист в сообщении, клик сохраняется. |
| Progress | Ответ содержит `Progress: Diet plan 40%` → прогресс-бар. |
| Flashcards | Ответ с `Q: ...` / `A: ...` → карточка, клик переворачивает. |
| Branching | Наведите на своё сообщение → карандаш → правка → Save → новая ветка ответа. |
| DnD PDF | Перетащите PDF → текст извлекается в артефакт и в контекст сообщения. |
| DnD image | Картинка добавляет метаданные в текст (vision зависит от модели API). |

---

## 2. Модели и токены

| Что | Как проверить |
|-----|----------------|
| Селектор моделей | В инпуте откройте список — все модели каталога. |
| Temperature / max_tokens | Внизу того же меню — слайдеры; отправьте сообщение и убедитесь, что запрос уходит (в Network: поля `temperature`, `max_tokens`). |
| Биллинг | Шапка → **Billing** — таблица и график после нескольких ответов. |

---

## 3. Агенты и MCP

| Что | Как проверить |
|-----|----------------|
| Панель Agents | Шапка → **Agents**. |
| MCP toggles | Включите/выключите сервер — состояние сохраняется (Rust/localStorage fallback). |
| Desktop FS | Укажите путь (напр. `C:\\`) → List — список файлов (только Tauri). |
| Terminal | Команда `echo Glow` → вывод. |
| Game Mode | **Force on** — бейдж в шапке, память на паузе; **Exit**. |

> Полноценный stdio-MCP к Roblox/Unity/Chrome требует установленных sidecar’ов; в UI — реестр + toggle + desktop/shell.

---

## 4. Память и проекты

| Что | Как проверить |
|-----|----------------|
| Projects | Сайдбар → Projects → создайте проект, фильтруйте чаты. В меню чата → Add to project. |
| Global memory | Ответ со строкой `Remember: user likes tea` → следующий чат должен видеть факт в контексте. |
| Customize | Settings (профиль) → Instructions for Glow. |

---

## 5. Study / Focus

| Что | Как проверить |
|-----|----------------|
| SRS | **Study** → Front/Back → Add card → список карточек. |
| Design prototype | Study → Design & Reflect → HTML в Artifacts. |
| Pomodoro | Start — таймер тикает; Focus Assist hint — текст про DND ОС. |

---

## 6. Game Mode

| Что | Как проверить |
|-----|----------------|
| Автодетект | Запустите процесс из watchlist (или Force on в Agents). |
| Эффект | Пока active — новые `Remember:` не пишутся в memory. |

---

## 7. Med

| Что | Как проверить |
|-----|----------------|
| Режим | Переключатель **Med** в сайдбаре. |
| Панель | Шапка → **Med**. |
| PII | Вставьте email/телефон → Redact. |
| Voice | Record 4s + transcribe → текст + redact. |
| Биомаркеры | Paste TSV → Parse; или Upload PDF → Parse → таблица + график. |
| Drugs | `warfarin, vitamin K` → Check → severity. |
| Protocol | Generate → Print / Save PDF (окно печати). |

---

## Голос в чате

| Кнопка | Ожидание |
|--------|----------|
| Волны (dictation) | Cancel/Stop → текст в чат. |
| Mic | Стрелка: устройства + уровень; запись → точки громкости → ✓ → `[Voice message]` + транскрипт. |
| Первый Whisper | Может скачать модель (~десятки МБ); статус «Загружаю модель…». |

---

## Регрессия API

Если снова `Failed to fetch`:

1. `npm run tauri:dev` (не голый браузер без proxy).
2. Проверьте `.env` ключ.
3. В dev запросы идут на `/smartapi` (Vite proxy).

---

## Чеклист «зелёный день»

1. Новый чат → вопрос → стрим OK  
2. Edit сообщения → ветка OK  
3. PDF drop → текст OK  
4. Model temp slider → OK  
5. Study / Agents / Med / Billing открываются  
6. Mic voice message → ИИ отвечает по смыслу  
7. HTML artifact iframe OK  
8. Jupyter Run cell OK (с сетью)  
