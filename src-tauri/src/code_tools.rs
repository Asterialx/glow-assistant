//! Tools for the Glow Code agent. Every function works inside the selected workspace folder and
//! consults `policy` first. Writes snapshot the original file per task so a whole task can be undone.

use crate::policy::{self, Decision};
use crate::state::AppState;
use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use regex::RegexBuilder;
use serde::Serialize;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const MAX_LIST_ITEMS: usize = 400;
const MAX_READ_LINES: usize = 2000;
const MAX_READ_CHARS: usize = 60_000;
const MAX_READ_BYTES: u64 = 5_000_000;
const MAX_SEARCH_FILE_BYTES: u64 = 1_000_000;
const MAX_SEARCH_RESULTS: usize = 100;
const MAX_WRITE_BYTES: usize = 2_000_000;
const CAPTURE_BYTES: usize = 400_000;

#[derive(Debug, Serialize)]
pub struct ListItem {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct ListResult {
    pub items: Vec<ListItem>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct ReadResult {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub total_lines: usize,
    pub truncated: bool,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct EditResult {
    pub path: String,
    pub replacements: usize,
    pub start_line: usize,
    pub diff: String,
}

#[derive(Debug, Serialize)]
pub struct CreateResult {
    pub path: String,
    pub bytes: usize,
    pub lines: usize,
}

#[derive(Debug, Serialize)]
pub struct RunResult {
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
}

fn root_of(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state.workspace_root.read().clone().ok_or_else(|| "Сначала выберите рабочую папку.".to_string())
}

/// A path the model supplies: relative, no `..`, no drive or root. `""` and `"."` mean the root.
fn relative(path: &str, allow_root: bool) -> Result<PathBuf, String> {
    let trimmed = path.trim().trim_start_matches("./").trim_start_matches(".\\");
    if trimmed.is_empty() || trimmed == "." {
        return if allow_root { Ok(PathBuf::new()) } else { Err("Укажите путь к файлу.".into()) };
    }
    let parsed = Path::new(trimmed);
    if trimmed.len() > 500 || parsed.components().any(|component| !matches!(component, Component::Normal(_))) {
        return Err("Недопустимый путь внутри рабочей папки.".into());
    }
    Ok(parsed.to_path_buf())
}

fn display(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn blocked(path: &Path, write: bool) -> Result<(), String> {
    match policy::path_blocked(path, write) {
        Some(reason) => Err(format!("Доступ закрыт: {reason}.")),
        None => Ok(()),
    }
}

/// Canonical path of an existing entry, which must stay inside the root (also through symlinks).
fn resolve_existing(root: &Path, rel: &Path) -> Result<PathBuf, String> {
    let canonical = root.join(rel).canonicalize().map_err(|_| "Файл или папка не найдены.".to_string())?;
    if !canonical.starts_with(root) { return Err("Действие выходит за пределы выбранной папки.".into()); }
    Ok(canonical)
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(4096)].contains(&0)
}

// ---------- reading ----------

pub fn list_in(root: &Path, path: &str, depth: usize) -> Result<ListResult, String> {
    let rel = relative(path, true)?;
    blocked(&rel, false)?;
    let start = resolve_existing(root, &rel)?;
    if !start.is_dir() { return Err("Это не папка.".into()); }
    let walk_root = root.to_path_buf();
    let mut items = Vec::new();
    let mut truncated = false;
    let walker = WalkBuilder::new(&start)
        .hidden(false)
        .require_git(false)
        .max_depth(Some(depth.clamp(1, 4)))
        .filter_entry(move |entry| {
            let name = entry.file_name().to_string_lossy();
            !(entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) && policy::is_skipped_dir(&name))
                && entry.path().strip_prefix(&walk_root).map(|rel| policy::path_blocked(rel, false).is_none()).unwrap_or(false)
        })
        .build();
    for entry in walker.flatten() {
        if entry.depth() == 0 { continue; }
        if items.len() >= MAX_LIST_ITEMS { truncated = true; break; }
        let Ok(rel) = entry.path().strip_prefix(root) else { continue };
        let Some(kind) = entry.file_type() else { continue };
        let size = if kind.is_file() { entry.metadata().map(|meta| meta.len()).unwrap_or(0) } else { 0 };
        items.push(ListItem { path: display(rel), is_dir: kind.is_dir(), size });
    }
    items.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(ListResult { items, truncated })
}

pub fn read_in(root: &Path, path: &str, start_line: Option<usize>, end_line: Option<usize>) -> Result<ReadResult, String> {
    let rel = relative(path, false)?;
    blocked(&rel, false)?;
    let file = resolve_existing(root, &rel)?;
    let metadata = std::fs::metadata(&file).map_err(|_| "Не удалось прочитать файл.".to_string())?;
    if !metadata.is_file() { return Err("Это не файл.".into()); }
    if metadata.len() > MAX_READ_BYTES { return Err("Файл больше 5 МБ, читать его целиком нельзя.".into()); }
    let bytes = std::fs::read(&file).map_err(|_| "Не удалось прочитать файл.".to_string())?;
    if looks_binary(&bytes) { return Err("Это бинарный файл, читать можно только текст.".into()); }
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = text.lines().collect();
    let total = lines.len();
    let start = start_line.unwrap_or(1).max(1);
    let requested_end = end_line.unwrap_or(start + MAX_READ_LINES - 1).min(start + MAX_READ_LINES - 1).min(total.max(1));
    let mut content = String::new();
    let mut last = start.saturating_sub(1);
    for index in (start - 1)..requested_end.min(total) {
        if content.len() + lines[index].len() + 1 > MAX_READ_CHARS { break; }
        content.push_str(lines[index]);
        content.push('\n');
        last = index + 1;
    }
    // "truncated" means there is more of the file after the window the model asked for.
    Ok(ReadResult { path: display(&rel), start_line: start, end_line: last, total_lines: total, truncated: last < total, content })
}

pub fn search_in(root: &Path, pattern: &str, path: &str, include: Option<&str>, ignore_case: bool, max_results: usize) -> Result<SearchResult, String> {
    if pattern.is_empty() || pattern.len() > 300 { return Err("Шаблон поиска пустой или слишком длинный.".into()); }
    let regex = RegexBuilder::new(pattern).case_insensitive(ignore_case).size_limit(1 << 20).build()
        .map_err(|error| format!("Некорректное регулярное выражение: {error}"))?;
    let rel = relative(path, true)?;
    blocked(&rel, false)?;
    let start = resolve_existing(root, &rel)?;
    let walk_root = root.to_path_buf();
    let mut builder = WalkBuilder::new(&start);
    // .gitignore is honoured even in a folder that is not a git repository yet.
    builder.hidden(false).require_git(false).filter_entry(move |entry| {
        let name = entry.file_name().to_string_lossy();
        !(entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) && policy::is_skipped_dir(&name))
            && entry.path().strip_prefix(&walk_root).map(|rel| policy::path_blocked(rel, false).is_none()).unwrap_or(false)
    });
    if let Some(glob) = include {
        let mut overrides = OverrideBuilder::new(&start);
        overrides.add(glob).map_err(|_| "Недопустимый шаблон файлов.".to_string())?;
        builder.overrides(overrides.build().map_err(|_| "Недопустимый шаблон файлов.".to_string())?);
    }
    let limit = max_results.clamp(1, MAX_SEARCH_RESULTS);
    let mut matches = Vec::new();
    let mut truncated = false;
    'files: for entry in builder.build().flatten() {
        if !entry.file_type().map(|kind| kind.is_file()).unwrap_or(false) { continue; }
        if entry.metadata().map(|meta| meta.len() > MAX_SEARCH_FILE_BYTES).unwrap_or(true) { continue; }
        let Ok(bytes) = std::fs::read(entry.path()) else { continue };
        if looks_binary(&bytes) { continue; }
        let Ok(rel) = entry.path().strip_prefix(root) else { continue };
        for (index, line) in String::from_utf8_lossy(&bytes).lines().enumerate() {
            if regex.is_match(line) {
                if matches.len() >= limit { truncated = true; break 'files; }
                matches.push(SearchMatch { path: display(rel), line: index + 1, text: line.trim().chars().take(300).collect() });
            }
        }
    }
    Ok(SearchResult { matches, truncated })
}

// ---------- snapshots for undo ----------

fn valid_task_id(task_id: &str) -> Result<(), String> {
    if task_id.is_empty() || task_id.len() > 64 || !task_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return Err("Недопустимый идентификатор задачи.".into());
    }
    Ok(())
}

fn fnv1a(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() { hash ^= *byte as u64; hash = hash.wrapping_mul(0x100000001b3); }
    format!("{hash:016x}")
}

fn checkpoint_dir(app: &AppHandle, root: &Path, task_id: &str) -> Result<PathBuf, String> {
    valid_task_id(task_id)?;
    let base = app.path().app_data_dir().map_err(|_| "Не удалось найти папку данных приложения.".to_string())?;
    Ok(base.join("checkpoints").join(fnv1a(&root.to_string_lossy())).join(task_id))
}

fn load_manifest(dir: &Path) -> serde_json::Map<String, serde_json::Value> {
    std::fs::read_to_string(dir.join("manifest.json")).ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

/// Remembers the original state of a file the first time a task touches it.
fn snapshot_before_write(checkpoints: &Path, root: &Path, rel: &Path) -> Result<(), String> {
    let key = display(rel);
    let mut manifest = load_manifest(checkpoints);
    if manifest.contains_key(&key) { return Ok(()); }
    let original = root.join(rel);
    let existed = original.is_file();
    if existed {
        let backup = checkpoints.join("files").join(rel);
        if let Some(parent) = backup.parent() { std::fs::create_dir_all(parent).map_err(|_| "Не удалось сохранить точку отката.".to_string())?; }
        std::fs::copy(&original, &backup).map_err(|_| "Не удалось сохранить точку отката.".to_string())?;
    }
    manifest.insert(key, serde_json::Value::Bool(existed));
    std::fs::create_dir_all(checkpoints).map_err(|_| "Не удалось сохранить точку отката.".to_string())?;
    std::fs::write(checkpoints.join("manifest.json"), serde_json::Value::Object(manifest).to_string())
        .map_err(|_| "Не удалось сохранить точку отката.".to_string())
}

/// Puts every file the task touched back as it was and returns how many were restored.
pub fn restore_in(root: &Path, checkpoints: &Path) -> Result<usize, String> {
    let manifest = load_manifest(checkpoints);
    if manifest.is_empty() { return Ok(0); }
    let mut restored = 0;
    for (key, existed) in &manifest {
        let rel = relative(key, false)?;
        blocked(&rel, true)?;
        let destination = root.join(&rel);
        if existed.as_bool().unwrap_or(false) {
            if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(|_| "Не удалось восстановить файл.".to_string())?; }
            std::fs::copy(checkpoints.join("files").join(&rel), &destination).map_err(|_| "Не удалось восстановить файл.".to_string())?;
        } else if destination.is_file() {
            std::fs::remove_file(&destination).map_err(|_| "Не удалось удалить созданный файл.".to_string())?;
        }
        restored += 1;
    }
    let _ = std::fs::remove_dir_all(checkpoints);
    Ok(restored)
}

// ---------- writing ----------

fn write_atomic(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = destination.parent().ok_or_else(|| "Недопустимый путь.".to_string())?;
    let temporary = directory.join(format!(".glow-edit-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, destination)
    })();
    if result.is_err() { let _ = std::fs::remove_file(&temporary); }
    result.map_err(|_| "Не удалось сохранить файл.".to_string())
}

/// Replaces `old` with `new` and returns the new text and the number of replacements.
pub fn apply_replacement(content: &str, old: &str, new: &str, replace_all: bool) -> Result<(String, usize), String> {
    if old.is_empty() { return Err("old_string не может быть пустым: для нового файла используйте code_create.".into()); }
    if old == new { return Err("old_string и new_string совпадают, менять нечего.".into()); }
    // Models write LF; keep a CRLF file CRLF so the whole file does not show up as changed.
    let crlf = content.contains("\r\n") && !content.replace("\r\n", "").contains('\n');
    let (old, new) = if crlf && !old.contains('\r') { (old.replace('\n', "\r\n"), new.replace('\n', "\r\n")) } else { (old.to_string(), new.to_string()) };
    let count = content.matches(old.as_str()).count();
    match count {
        0 => Err("old_string не найден в файле. Прочитайте файл заново и скопируйте фрагмент точно, включая отступы.".into()),
        1 => Ok((content.replacen(old.as_str(), &new, 1), 1)),
        _ if replace_all => Ok((content.replace(old.as_str(), &new), count)),
        _ => Err(format!("old_string найден {count} раз(а). Добавьте строки вокруг, чтобы совпадение было единственным, или укажите replace_all.")),
    }
}

fn change_diff(before: &str, old: &str, new: &str) -> (usize, String) {
    let position = before.find(old).or_else(|| before.find(&old.replace('\n', "\r\n"))).unwrap_or(0);
    let start_line = before[..position].matches('\n').count() + 1;
    let lines: Vec<&str> = before.lines().collect();
    let first = start_line.saturating_sub(1);
    let removed = old.trim_end_matches(['\r', '\n']).lines().count().max(1);
    let context_before = lines[first.saturating_sub(3)..first.min(lines.len())].iter();
    let context_after = lines[(first + removed).min(lines.len())..(first + removed + 3).min(lines.len())].iter();
    let mut diff = format!("@@ -{},{} @@\n", start_line, removed);
    for line in context_before { diff.push_str(&format!(" {line}\n")); }
    for line in old.trim_end_matches(['\r', '\n']).lines() { diff.push_str(&format!("-{line}\n")); }
    for line in new.trim_end_matches(['\r', '\n']).lines() { diff.push_str(&format!("+{line}\n")); }
    for line in context_after { diff.push_str(&format!(" {line}\n")); }
    (start_line, diff)
}

pub fn edit_in(root: &Path, checkpoints: &Path, path: &str, old: &str, new: &str, replace_all: bool) -> Result<EditResult, String> {
    let rel = relative(path, false)?;
    blocked(&rel, true)?;
    let file = resolve_existing(root, &rel)?;
    let metadata = std::fs::metadata(&file).map_err(|_| "Не удалось прочитать файл.".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_READ_BYTES { return Err("Файл нельзя изменить: это не обычный файл или он больше 5 МБ.".into()); }
    let bytes = std::fs::read(&file).map_err(|_| "Не удалось прочитать файл.".to_string())?;
    if looks_binary(&bytes) { return Err("Это бинарный файл, менять можно только текст.".into()); }
    let before = String::from_utf8(bytes).map_err(|_| "Файл не в кодировке UTF-8, менять его нельзя.".to_string())?;
    let (after, replacements) = apply_replacement(&before, old, new, replace_all)?;
    if after.len() > MAX_WRITE_BYTES * 2 { return Err("Результат слишком большой.".into()); }
    snapshot_before_write(checkpoints, root, &rel)?;
    write_atomic(&file, after.as_bytes())?;
    let old_as_stored = if before.contains(old) { old.to_string() } else { old.replace('\n', "\r\n") };
    let (start_line, diff) = change_diff(&before, &old_as_stored, new);
    Ok(EditResult { path: display(&rel), replacements, start_line, diff })
}

pub fn create_in(root: &Path, checkpoints: &Path, path: &str, content: &str) -> Result<CreateResult, String> {
    let rel = relative(path, false)?;
    blocked(&rel, true)?;
    if content.len() > MAX_WRITE_BYTES { return Err("Файл больше 2 МБ.".into()); }
    let destination = root.join(&rel);
    if destination.exists() { return Err("Файл уже существует. Для изменения используйте code_edit.".into()); }
    let parent = destination.parent().ok_or_else(|| "Недопустимый путь.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|_| "Не удалось создать папку.".to_string())?;
    let canonical_parent = parent.canonicalize().map_err(|_| "Не удалось создать папку.".to_string())?;
    if !canonical_parent.starts_with(root) { return Err("Действие выходит за пределы выбранной папки.".into()); }
    snapshot_before_write(checkpoints, root, &rel)?;
    write_atomic(&destination, content.as_bytes())?;
    Ok(CreateResult { path: display(&rel), bytes: content.len(), lines: content.lines().count() })
}

pub fn delete_in(root: &Path, checkpoints: &Path, path: &str) -> Result<(), String> {
    let rel = relative(path, false)?;
    blocked(&rel, true)?;
    let file = resolve_existing(root, &rel)?;
    if !file.is_file() { return Err("Удалять можно только файлы.".into()); }
    snapshot_before_write(checkpoints, root, &rel)?;
    std::fs::remove_file(file).map_err(|_| "Не удалось удалить файл.".to_string())
}

// ---------- running commands ----------

#[cfg(windows)]
const CMD_SHIMS: &[&str] = &["npm", "npx", "yarn", "pnpm", "tsc", "eslint", "vitest", "jest", "prettier"];

fn build_command(program: &str, args: &[String]) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut command = if CMD_SHIMS.contains(&program) {
            let mut shim = Command::new("cmd");
            shim.arg("/C").arg(program);
            shim
        } else {
            Command::new(program)
        };
        command.args(args).creation_flags(0x0800_0000);
        command
    }
    #[cfg(not(windows))]
    {
        let mut command = Command::new(program);
        command.args(args);
        command
    }
}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x0800_0000).status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
}

fn capture<R: Read + Send + 'static>(mut stream: R) -> (Arc<Mutex<Vec<u8>>>, std::thread::JoinHandle<()>) {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let shared = buffer.clone();
    let handle = std::thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        while let Ok(read) = stream.read(&mut chunk) {
            if read == 0 { break; }
            let mut data = shared.lock().unwrap();
            if data.len() < CAPTURE_BYTES { let room = CAPTURE_BYTES - data.len(); data.extend_from_slice(&chunk[..read.min(room)]); }
        }
    });
    (buffer, handle)
}

/// Keeps the beginning and, more importantly for failing tests, the end of long output.
pub fn clip(text: &str, max_chars: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max_chars { return text.to_string(); }
    let head = max_chars / 4;
    let tail = max_chars - head;
    let omitted = chars.len() - max_chars;
    format!("{}\n… пропущено {omitted} символов …\n{}", chars[..head].iter().collect::<String>(), chars[chars.len() - tail..].iter().collect::<String>())
}

fn is_secret_variable(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    ["TOKEN", "SECRET", "PASSWORD", "PASSWD", "API_KEY", "APIKEY", "PRIVATE_KEY", "CREDENTIAL"].iter().any(|part| upper.contains(part))
}

pub fn run_in(root: &Path, command: &str, approved: bool, timeout: Duration) -> Result<RunResult, String> {
    match policy::classify_command(command) {
        Decision::Deny(reason) => return Err(format!("Запрещено: {reason}.")),
        Decision::Ask(reason) if !approved => return Err(format!("Нужно подтверждение: {reason}.")),
        _ => {}
    }
    let tokens = policy::parse_command(command)?;
    let program = policy::program_name(&tokens[0])?;
    let mut process = build_command(&program, &tokens[1..]);
    process.current_dir(root).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for (name, _) in std::env::vars() {
        if is_secret_variable(&name) { process.env_remove(name); }
    }
    let mut child = process.spawn().map_err(|_| format!("Не удалось запустить «{program}». Установлена ли эта программа?"))?;
    let (stdout, stdout_reader) = capture(child.stdout.take().ok_or("Не удалось прочитать вывод.")?);
    let (stderr, stderr_reader) = capture(child.stderr.take().ok_or("Не удалось прочитать вывод.")?);
    let started = Instant::now();
    let mut timed_out = false;
    let exit_code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) if started.elapsed() >= timeout => {
                kill_tree(child.id());
                let _ = child.kill();
                let _ = child.wait();
                timed_out = true;
                break None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => break None,
        }
    };
    // A grandchild may keep the pipe open; give the readers a moment and use what they have.
    let deadline = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < deadline && !(stdout_reader.is_finished() && stderr_reader.is_finished()) {
        std::thread::sleep(Duration::from_millis(20));
    }
    let text = |buffer: &Arc<Mutex<Vec<u8>>>| String::from_utf8_lossy(&buffer.lock().unwrap()).into_owned();
    Ok(RunResult { exit_code, timed_out, stdout: clip(&text(&stdout), 10_000), stderr: clip(&text(&stderr), 10_000) })
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn code_list(state: State<'_, AppState>, path: Option<String>, depth: Option<usize>) -> Result<ListResult, String> {
    list_in(&root_of(&state)?, path.as_deref().unwrap_or("."), depth.unwrap_or(2))
}

#[tauri::command]
pub fn code_read(state: State<'_, AppState>, path: String, start_line: Option<usize>, end_line: Option<usize>) -> Result<ReadResult, String> {
    read_in(&root_of(&state)?, &path, start_line, end_line)
}

#[tauri::command]
pub fn code_search(state: State<'_, AppState>, pattern: String, path: Option<String>, include: Option<String>, ignore_case: Option<bool>, max_results: Option<usize>) -> Result<SearchResult, String> {
    search_in(&root_of(&state)?, &pattern, path.as_deref().unwrap_or("."), include.as_deref(), ignore_case.unwrap_or(false), max_results.unwrap_or(50))
}

#[tauri::command]
pub fn code_edit(app: AppHandle, state: State<'_, AppState>, task_id: String, path: String, old_string: String, new_string: String, replace_all: Option<bool>) -> Result<EditResult, String> {
    let root = root_of(&state)?;
    edit_in(&root, &checkpoint_dir(&app, &root, &task_id)?, &path, &old_string, &new_string, replace_all.unwrap_or(false))
}

#[tauri::command]
pub fn code_create(app: AppHandle, state: State<'_, AppState>, task_id: String, path: String, content: String) -> Result<CreateResult, String> {
    let root = root_of(&state)?;
    create_in(&root, &checkpoint_dir(&app, &root, &task_id)?, &path, &content)
}

/// Deleting always needs the user's click, so `approved` must be true.
#[tauri::command]
pub fn code_delete(app: AppHandle, state: State<'_, AppState>, task_id: String, path: String, approved: bool) -> Result<(), String> {
    if !approved { return Err("Нужно подтверждение: удаление файла.".into()); }
    let root = root_of(&state)?;
    delete_in(&root, &checkpoint_dir(&app, &root, &task_id)?, &path)
}

#[tauri::command]
pub async fn code_run(state: State<'_, AppState>, command: String, approved: bool, timeout_sec: Option<u64>) -> Result<RunResult, String> {
    let root = root_of(&state)?;
    let timeout = Duration::from_secs(timeout_sec.unwrap_or(120).clamp(5, 600));
    tauri::async_runtime::spawn_blocking(move || run_in(&root, &command, approved, timeout))
        .await
        .map_err(|_| "Не удалось выполнить команду.".to_string())?
}

/// Lets the UI ask the policy before it shows a confirmation dialog.
#[tauri::command]
pub fn code_classify_command(command: String) -> Decision {
    policy::classify_command(&command)
}

#[tauri::command]
pub fn code_restore_checkpoint(app: AppHandle, state: State<'_, AppState>, task_id: String) -> Result<usize, String> {
    let root = root_of(&state)?;
    restore_in(&root, &checkpoint_dir(&app, &root, &task_id)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A throwaway workspace plus a separate folder for its checkpoints; both are deleted on drop.
    fn workspace() -> (Vec<tempfile::TempDir>, PathBuf, PathBuf) {
        let project = tempfile::tempdir().unwrap();
        let backup = tempfile::tempdir().unwrap();
        let root = project.path().canonicalize().unwrap();
        let checkpoints = backup.path().join("task");
        (vec![project, backup], root, checkpoints)
    }

    #[test]
    fn replacement_needs_one_exact_match_unless_replace_all() {
        assert_eq!(apply_replacement("a b a", "b", "c", false).unwrap().0, "a c a");
        assert!(apply_replacement("a b a", "a", "c", false).is_err());
        assert_eq!(apply_replacement("a b a", "a", "c", true).unwrap(), ("c b c".to_string(), 2));
        assert!(apply_replacement("abc", "x", "y", false).is_err());
        assert!(apply_replacement("abc", "", "y", false).is_err());
        assert!(apply_replacement("abc", "a", "a", false).is_err());
    }

    #[test]
    fn crlf_files_stay_crlf() {
        let (after, count) = apply_replacement("one\r\ntwo\r\nthree\r\n", "one\ntwo", "ONE\nTWO", false).unwrap();
        assert_eq!(count, 1);
        assert_eq!(after, "ONE\r\nTWO\r\nthree\r\n");
    }

    #[test]
    fn edit_create_delete_and_restore_round_trip() {
        let (_guard, root, checkpoints) = workspace();
        fs::write(root.join("a.txt"), "hello\nworld\n").unwrap();
        fs::write(root.join("keep.txt"), "untouched").unwrap();
        let edit = edit_in(&root, &checkpoints, "a.txt", "world", "there", false).unwrap();
        assert_eq!(edit.replacements, 1);
        assert!(edit.diff.contains("-world") && edit.diff.contains("+there"));
        create_in(&root, &checkpoints, "src/new.ts", "export {}\n").unwrap();
        delete_in(&root, &checkpoints, "keep.txt").unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "hello\nthere\n");
        assert!(!root.join("keep.txt").exists());
        assert_eq!(restore_in(&root, &checkpoints).unwrap(), 3);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "hello\nworld\n");
        assert_eq!(fs::read_to_string(root.join("keep.txt")).unwrap(), "untouched");
        assert!(!root.join("src/new.ts").exists());
        let _ = fs::remove_dir_all(&checkpoints);
    }

    #[test]
    fn second_edit_keeps_the_first_snapshot() {
        let (_guard, root, checkpoints) = workspace();
        fs::write(root.join("a.txt"), "1").unwrap();
        edit_in(&root, &checkpoints, "a.txt", "1", "2", false).unwrap();
        edit_in(&root, &checkpoints, "a.txt", "2", "3", false).unwrap();
        restore_in(&root, &checkpoints).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "1");
    }

    #[test]
    fn writes_cannot_escape_or_touch_secrets() {
        let (_guard, root, checkpoints) = workspace();
        fs::write(root.join(".env"), "KEY=1").unwrap();
        assert!(edit_in(&root, &checkpoints, ".env", "1", "2", false).is_err());
        assert!(create_in(&root, &checkpoints, "../outside.txt", "x").is_err());
        assert!(create_in(&root, &checkpoints, "node_modules/x/index.js", "x").is_err());
        assert!(create_in(&root, &checkpoints, ".git/hooks/pre-commit", "x").is_err());
        assert!(read_in(&root, ".env", None, None).is_err());
        assert!(create_in(&root, &checkpoints, "a.txt", "x").is_ok());
        assert!(create_in(&root, &checkpoints, "a.txt", "y").is_err());
        let _ = fs::remove_dir_all(&checkpoints);
    }

    #[test]
    fn read_returns_a_numbered_window_and_rejects_binary() {
        let (_guard, root, _) = workspace();
        let text: String = (1..=10).map(|n| format!("line {n}\n")).collect();
        fs::write(root.join("a.txt"), text).unwrap();
        let part = read_in(&root, "a.txt", Some(3), Some(5)).unwrap();
        assert_eq!((part.start_line, part.end_line, part.total_lines), (3, 5, 10));
        assert_eq!(part.content, "line 3\nline 4\nline 5\n");
        assert!(part.truncated);
        assert!(!read_in(&root, "a.txt", None, None).unwrap().truncated);
        fs::write(root.join("b.bin"), [0u8, 1, 2]).unwrap();
        assert!(read_in(&root, "b.bin", None, None).is_err());
    }

    #[test]
    fn list_and_search_skip_ignored_and_secret_files() {
        let (_guard, root, _) = workspace();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("src/main.ts"), "const needle = 1;\n").unwrap();
        fs::write(root.join("node_modules/pkg/i.js"), "needle").unwrap();
        fs::write(root.join(".env"), "needle=1").unwrap();
        fs::write(root.join(".gitignore"), "ignored.txt\n").unwrap();
        fs::write(root.join("ignored.txt"), "needle").unwrap();
        let listing = list_in(&root, ".", 3).unwrap();
        let paths: Vec<_> = listing.items.iter().map(|item| item.path.as_str()).collect();
        assert!(paths.contains(&"src/main.ts") && paths.contains(&".gitignore"));
        assert!(!paths.iter().any(|path| path.contains("node_modules") || *path == ".env"));
        let found = search_in(&root, "needle", ".", None, false, 50).unwrap();
        assert_eq!(found.matches.len(), 1);
        assert_eq!(found.matches[0].path, "src/main.ts");
        assert_eq!(search_in(&root, "NEEDLE", ".", Some("*.ts"), true, 50).unwrap().matches.len(), 1);
        assert!(search_in(&root, "(", ".", None, false, 5).is_err());
    }

    #[test]
    fn clip_keeps_head_and_tail() {
        let clipped = clip(&"x".repeat(100), 20);
        assert!(clipped.contains("пропущено 80"));
        assert_eq!(clip("short", 20), "short");
    }

    #[test]
    fn denied_and_unapproved_commands_do_not_run() {
        let (_guard, root, _) = workspace();
        assert!(run_in(&root, "rm -rf .", true, Duration::from_secs(5)).is_err());
        assert!(run_in(&root, "node script.js", false, Duration::from_secs(5)).unwrap_err().contains("подтверждение"));
        assert!(run_in(&root, "npm test && x", true, Duration::from_secs(5)).is_err());
    }

    #[test]
    fn approved_command_runs_and_captures_output() {
        let (_guard, root, _) = workspace();
        fs::write(root.join("hello.js"), "console.log('hi from node'); process.exitCode = 3;").unwrap();
        let result = run_in(&root, "node hello.js", true, Duration::from_secs(30)).unwrap();
        assert_eq!(result.exit_code, Some(3));
        assert!(result.stdout.contains("hi from node"));
        assert!(!result.timed_out);
    }

    #[test]
    fn long_running_command_is_killed_at_the_timeout() {
        let (_guard, root, _) = workspace();
        fs::write(root.join("slow.js"), "setInterval(() => {}, 1000)").unwrap();
        let started = Instant::now();
        let result = run_in(&root, "node slow.js", true, Duration::from_millis(600)).unwrap();
        assert!(result.timed_out);
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}
