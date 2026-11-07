# Glow Assistant — памятка проекта

Читать весь проект не нужно: эта памятка и `grep` по коду дают почти всё нужное. Обновляйте этот файл, когда меняется архитектура, команды или состояние.

## Что это
AI-рабочее пространство на русском: чат, Artifacts, GenUI-виджеты, экспорт файлов (DOCX/PDF/XLSX/PPTX), режим «Работа» (папка на ПК, курсовые), веб-поиск, админка приглашений и токенов.

## Стек и где что лежит
- **Фронтенд:** React 18 + TypeScript + Vite + Tailwind + Zustand (`src/`).
- **Desktop:** Tauri 2 (`src-tauri/`), Rust-команды в `src-tauri/src/commands.rs` (workspace_*, export_save_file, mcp, game mode).
- **Серверный API:** Vercel, файлы `api/*.js` (`ai.js` — прокси к OpenRouter с резервом токенов, `invite.js` — приглашения, `webSearch.js` — лимиты поиска).
- **База:** Supabase, миграции `supabase/migrations/`, edge-функция `supabase/functions/glow-invite/`.
- **Тесты:** `node --test tests/*.mjs` (144 теста). Rust: `cargo test --lib` в `src-tauri` (42 теста; git-тесты создают временные репозитории и требуют установленный `git`).
- **Вкладки Чат / Работа / Код:** «Работа» (документы, курсовые, `glow-file`) и «Код» (агент) делят область хранения `code`, потому что сервер и облачные таблицы знают только `home/code/med`; различаются видом `modeStore.codeKind` (`work`/`dev`, `src/lib/codeKind.ts`), а чаты «Кода» имеют префикс id `dev_` (старые чаты остаются в «Работе»; новая область потребовала бы SQL-миграции).
- **Glow Code (агент разработки, фаза 1):** режим «Код» с подключённой папкой запускает цикл агента. Режимы Авто и План (`workspaceStore.taskMode`: `work`/`plan`), три уровня автономии (`agentStore.autonomy`: autopilot, important, tasks). Цикл: `src/lib/agent/loop.ts`; решения о правах: `src/lib/agent/policy.ts` и `src-tauri/src/policy.rs` (Rust проверяет всё повторно, `approved` ставит только UI); инструменты: `src-tauri/src/code_tools.rs` (`code_list/read/search/edit/create/delete/run`, откат через снимки в app data); схемы инструментов на сервере: `api/agentTools.js` (клиент шлёт только `tool_set`); след шагов в ответе: блок `glow-agent` (`src/lib/agent/trace.ts`); UI: `src/components/agent/`. Фаза 2 (git): `src-tauri/src/git_tools.rs` — `git_status/diff/log/branch/commit` через системный `git` (хуки не запускаются, секреты не попадают в коммиты и снимки, ветки только `glow/…`, `push` запрещён политикой) и чекпоинты задачи на refs `refs/glow/checkpoints/<id>/before|after` (снимок рабочего дерева в приватном индексе, не трогает индекс и ветку пользователя; откат возвращает только файлы, оставшиеся в состоянии «после задачи», коммиты задачи не отменяет; вне git работают пофайловые снимки). Автопилот коммитит без вопроса только на ветке `glow/…`. Инструмент `code_preview` открывает HTML-файл проекта в браузере по умолчанию (агент страницу не видит). Не сделано: подагенты, MCP (фазы 3–4 плана).

- **Состояние после сессии 2026-11-01:** подробности и открытые вопросы в `docs/HANDOFF_2026-11-01.md`. Режим выбирается кнопкой `src/components/input/ModeSelect.tsx` слева от микрофона; в «Коде» справа панель `src/components/agent/AgentPanel.tsx` (консоль и план); агент умеет задавать вопросы инструментом `ask_user` (окно `AgentQuestions.tsx`, схема в `api/agentTools.js`); формулы KaTeX (`src/lib/math.ts`), блок кода с копированием (`src/components/chat/CodeBlock.tsx`), автопродолжение обрезанных ответов в `smartapi.ts`. Тестов теперь 167.
- **Формулы (2026-11-07):** `remark-math` работает с `singleDollarTextMath: false`, поэтому цены вида «$5 … $50» остаются текстом; `normalizeMath` (`src/lib/math.ts`) приводит все формулы к `$$…$$` (одиночные `$x$` — по правилу Pandoc), оборачивает голые `\begin{equation|align|gather|alignat}`; химия через `katex/contrib/mhchem` (импорт в `ChatPane.tsx`). Ошибки JS и заблокированные внешние скрипты в HTML-артефакте мост песочницы шлёт как `glow-html-error`; `HtmlArtifactFrame` показывает плашку с кнопкой «Исправить» (событие `glow:fix-artifact` → `handleSend` в `AppShell`). Аудит: `docs/QA_AUDIT_2026-11-07.md`.

## Ключевые файлы
- `src/conversation/ConversationEngine.ts` — отправка сообщения, создание чата, ветки, стриминг ответа.
- `src/conversation/adapters/smartApiResponseGenerator.ts` — вызов модели, цикл инструментов (Work), ветка курсовой, выбор `webTools`/`outputBudget`.
- `src/components/layout/AppShell.tsx` — `handleSend`, `createGenerationOptions`, `loadConversation`, `handleResendMessage`.
- `src/components/chat/ChatPane.tsx` — лента сообщений, кнопки под сообщениями, статус «Думаю…».
- `src/components/input/SmartInputBar.tsx` — поле ввода, Work/План, диалог скачивания (`GLOW_DESKTOP_DOWNLOAD_URL`).
- `src/lib/llm/smartapi.ts` — сборка промпта (`buildChatPayload`), стриминг, веб-инструменты.
- `src/lib/webSearchIntent.ts` — ключевые слова для веб-поиска (`shouldSearchWeb`).
- `src/lib/coursework.ts` — конвейер курсовой: уточнения → план → главы → список литературы → один файл.
- `src/lib/generatedFile.ts` — схема `glow-file` (что модель может вернуть как файл).
- `src/lib/fileExport.ts` — экспорт DOCX (Times 14, ГОСТ-поля, оглавление), PDF, XLSX, PPTX; `downloadBlob` в desktop идёт через системное окно сохранения.
- `src/lib/models.ts` — каталог моделей: GLM 5.3 Flash, Claude Haiku 5.5, GPT 6 Luna (`openai/gpt-6-luna`). Серверный список — `api/ai.js`.
- `src/auth/AdminPanel.tsx` — приглашения и начисление токенов; в desktop запросы идут на `glowai-ashy.vercel.app` через plugin-http.
- `src/stores/workspaceStore.ts`, `src/lib/workspace.ts`, `src/lib/workspaceTools.ts` — режим Work (папка).

## Команды
- `npm run dev` — разработка в браузере (localhost:1420).
- `npm run build` — проверка типов и сборка web (`tsc -b && vite build`).
- `npx tsc -b` — только типы.
- `npm run tauri:build` — установщик: `src-tauri\target\release\bundle\nsis\Glow Assistant_0.1.0_x64-setup.exe`.
- Установка поверх старой версии: закрыть приложение, затем `установщик /S`.
- Публикация на сайт: `scripts\publish-installer.ps1 -Version 0.1.0` (нужен `GITHUB_TOKEN` в окружении, токен не коммитить). Или `scripts\build-and-publish.ps1`.
- Ссылка для скачивания на сайте: `https://github.com/Asterialx/glow-assistant/releases/latest/download/Glow-Assistant-setup.exe`.

## Git
- Основная ветка: `next`, remote `origin` = `github.com/Asterialx/glow-assistant`.
- Коммиты делаем с `-c user.name="Claude" -c user.email="noreply@anthropic.com"` и строкой `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` в конце сообщения.
- Не пушить без подтверждения пользователя: пуш запускает деплой на Vercel.
- Не коммитить установщики и секреты.

## Токены и лимиты (важно для расхода)
- Учёт: `api/tokenUsage.js` резервирует `reservationFor(messages) + maxOutput` (+80 000 при веб-поиске), списывает фактический `total` из `usage` провайдера. С 2026-11-03 токены, прочитанные из кэша провайдера (`cache_read`), списываются с кошелька на 10% (возврат 90% в `glow_settle_token_usage`, миграция `202611030002`; у Haiku чтение кэша стоит 0,1, запись 1,25 от входа). Админ (`role=admin`) без лимитов (`202611030001`), расход пишется.
- Расход агента: вход ≈ 4,6–5,1 тыс. токенов на шаге при старте и растёт с результатами инструментов; список изменённых файлов вместо следов прошлых задач, без промпта чата (`codeAgent` в `buildChatPayload`), результат инструмента до 8000 символов, 6 последних результатов целиком (`src/lib/agent/context.ts`).
- Выход модели: по умолчанию 4096, в Work и дизайн-режиме не меньше 12 000, сервер ограничивает 16 384.
- Лимиты поиска: `api/webSearch.js` — 10 результатов, 8 поисков, 8 чтений страниц.
- Лимиты чтения файлов в Work убраны по просьбе пользователя (см. `2e563d6`). Если расход станет проблемой, вернуть лимит — решение пользователя.
- Выдача токенов: до 10 000 000 (миграция `202610220001_token_limit_10m.sql`).

## Текущее состояние (обновлять по мере изменений)
- Опубликован установщик 0.1.0 на GitHub Release, ссылка на сайте работает.
- В последней установке на ПК: отправка без задержки, копирование и повтор сообщений, поиск, который сам решает, когда искать, GPT 6 Luna в списке, приглашения из приложения.
- **Применено в Supabase вручную через SQL Editor (2026-11-01):** `202610220001_token_limit_10m.sql` (лимит токенов 10 млн) и `202611010001_agent_request_limits.sql` (запросы в минуту 6 → 60, в сутки 50 → 10 000: агент делает по запросу на шаг). В проекте раздел «Migrations» пуст, потому что файлы вставлялись руками; при новой базе применять все файлы по порядку.
- **Не решено:** письма приглашения попадают в спам — нужен свой SMTP и настройка SPF/DKIM.
- **Не проверено в приложении:** режим Work с папкой (выбор, чтение, сохранение), курсовая целиком, поиск по вопросам о текущих событиях.
- Плагин Ponytail из GitHub не установлен: маркетплейс не подключился из окна Claude Code.

## Соглашения
- Интерфейс и тексты пользователю — на русском; код, комментарии в коде и сообщения коммитов — на английском или по месту.
- В PowerShell для правок файлов с кириллицей читать и писать через `[System.IO.File]` с UTF-8 без BOM. `Get-Content` без `-Encoding` и `Set-Content` без `-Encoding utf8` портят русский текст.
- Фоновые сборки: выводить лог в файл, не зависеть от перенаправления вывода в фоновой команде (падало из-за этого один раз).
- Вопросы пользователю про публикацию, установку, пуш и отправку писем — только с явного подтверждения.
