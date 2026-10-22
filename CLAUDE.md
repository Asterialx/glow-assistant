# Glow Assistant — памятка проекта

Читать весь проект не нужно: эта памятка и `grep` по коду дают почти всё нужное. Обновляйте этот файл, когда меняется архитектура, команды или состояние.

## Что это
AI-рабочее пространство на русском: чат, Artifacts, GenUI-виджеты, экспорт файлов (DOCX/PDF/XLSX/PPTX), режим «Работа» (папка на ПК, курсовые), веб-поиск, админка приглашений и токенов.

## Стек и где что лежит
- **Фронтенд:** React 18 + TypeScript + Vite + Tailwind + Zustand (`src/`).
- **Desktop:** Tauri 2 (`src-tauri/`), Rust-команды в `src-tauri/src/commands.rs` (workspace_*, export_save_file, mcp, game mode).
- **Серверный API:** Vercel, файлы `api/*.js` (`ai.js` — прокси к OpenRouter с резервом токенов, `invite.js` — приглашения, `webSearch.js` — лимиты поиска).
- **База:** Supabase, миграции `supabase/migrations/`, edge-функция `supabase/functions/glow-invite/`.
- **Тесты:** `node --test tests/*.mjs` (105 тестов). Rust: `cargo test` в `src-tauri`.

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
- Учёт: `api/tokenUsage.js` резервирует `reservationFor(messages) + maxOutput` (+80 000 при веб-поиске), списывает фактический `total` из `usage` провайдера. Кэш не уменьшает списание.
- Выход модели: по умолчанию 4096, в Work и дизайн-режиме не меньше 12 000, сервер ограничивает 16 384.
- Лимиты поиска: `api/webSearch.js` — 10 результатов, 8 поисков, 8 чтений страниц.
- Лимиты чтения файлов в Work убраны по просьбе пользователя (см. `2e563d6`). Если расход станет проблемой, вернуть лимит — решение пользователя.
- Выдача токенов: до 10 000 000 (миграция `202610220001_token_limit_10m.sql`).

## Текущее состояние (обновлять по мере изменений)
- Опубликован установщик 0.1.0 на GitHub Release, ссылка на сайте работает.
- В последней установке на ПК: отправка без задержки, копирование и повтор сообщений, поиск, который сам решает, когда искать, GPT 6 Luna в списке, приглашения из приложения.
- **Не применено:** миграция `202610220001_token_limit_10m.sql` в Supabase (в проекте «No migrations»). Пока её нет, лимит 10 млн в базе не работает.
- **Не решено:** письма приглашения попадают в спам — нужен свой SMTP и настройка SPF/DKIM.
- **Не проверено в приложении:** режим Work с папкой (выбор, чтение, сохранение), курсовая целиком, поиск по вопросам о текущих событиях.
- Плагин Ponytail из GitHub не установлен: маркетплейс не подключился из окна Claude Code.

## Соглашения
- Интерфейс и тексты пользователю — на русском; код, комментарии в коде и сообщения коммитов — на английском или по месту.
- В PowerShell для правок файлов с кириллицей читать и писать через `[System.IO.File]` с UTF-8 без BOM. `Get-Content` без `-Encoding` и `Set-Content` без `-Encoding utf8` портят русский текст.
- Фоновые сборки: выводить лог в файл, не зависеть от перенаправления вывода в фоновой команде (падало из-за этого один раз).
- Вопросы пользователю про публикацию, установку, пуш и отправку писем — только с явного подтверждения.
