use crate::game_mode;
use crate::mcp;
use crate::pii::{self, RedactionResult};
use crate::state::{AppState, GameModeState, McpServerConfig};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use std::path::{Component, Path, PathBuf};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

#[derive(Debug, Serialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let parsed = Path::new(path);
    if parsed.as_os_str().is_empty() || parsed.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Недопустимый путь внутри рабочей папки.".into());
    }
    Ok(parsed.to_path_buf())
}

const WORKSPACE_SKIP_DIRS: &[&str] = &[".git", "node_modules", "dist", "target", ".next", ".vercel", "appdata"];
const WORKSPACE_READ_EXTENSIONS: &[&str] = &["txt", "md", "csv", "tsv", "json", "xml", "yaml", "yml", "py", "ts", "tsx", "js", "jsx", "html", "css", "sql", "log", "rst", "srt", "pdf", "docx", "xlsx", "pptx", "ipynb", "rtf", "odt", "ods", "odp", "jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "mp3", "wav", "m4a", "ogg", "aac", "flac", "mp4", "mov", "webm"];

/// Same rules as the listing: no hidden or skipped folders and no hidden files, and only supported extensions.
/// Reads are checked here because the model can request any path string, not only listed ones.
fn is_readable_workspace_path(relative: &Path) -> bool {
    let components: Vec<_> = relative.components().collect();
    if components.is_empty() { return false; }
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(name) = component else { return false };
        let name = name.to_string_lossy().to_ascii_lowercase();
        let is_folder = index < components.len() - 1;
        if name.starts_with('.') || (is_folder && WORKSPACE_SKIP_DIRS.contains(&name.as_str())) { return false; }
    }
    let extension = relative.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase();
    WORKSPACE_READ_EXTENSIONS.contains(&extension.as_str())
}

const EXPORT_EXTENSIONS: &[&str] = &["md", "txt", "csv", "json", "docx", "pdf", "xlsx", "pptx", "png", "svg", "ipynb"];

/// Writes a file the user picked in the native save dialog. Only export formats are accepted.
#[tauri::command]
pub fn export_save_file(path: String, bytes_base64: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let extension = target.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !EXPORT_EXTENSIONS.contains(&extension.as_str()) { return Err("Этот формат нельзя сохранить.".into()); }
    if bytes_base64.len() > 40_000_000 { return Err("Файл слишком большой.".into()); }
    let bytes = BASE64.decode(bytes_base64).map_err(|_| "Некорректное содержимое файла.".to_string())?;
    std::fs::write(&target, bytes).map_err(|_| "Не удалось сохранить файл.".to_string())
}

#[cfg(test)]
mod workspace_read_rules {
    use super::is_readable_workspace_path;
    use std::path::Path;

    #[test]
    fn allows_supported_files_in_folders() {
        assert!(is_readable_workspace_path(Path::new("notes/plan.md")));
        assert!(is_readable_workspace_path(Path::new("report.PDF")));
    }

    #[test]
    fn rejects_hidden_files_and_folders() {
        assert!(!is_readable_workspace_path(Path::new(".env")));
        assert!(!is_readable_workspace_path(Path::new(".git/config")));
        assert!(!is_readable_workspace_path(Path::new("src/.secrets/keys.txt")));
    }

    #[test]
    fn rejects_skipped_folders_and_unsupported_extensions() {
        assert!(!is_readable_workspace_path(Path::new("node_modules/pkg/index.js")));
        assert!(!is_readable_workspace_path(Path::new("AppData/Roaming/token.json")));
        assert!(!is_readable_workspace_path(Path::new("keys/id_rsa")));
        assert!(!is_readable_workspace_path(Path::new("cert.pem")));
        assert!(!is_readable_workspace_path(Path::new("")));
    }
}

fn selected_root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state.workspace_root.read().clone().ok_or_else(|| "Сначала выберите рабочую папку.".into())
}

fn ensure_inside(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|_| "Файл не найден или недоступен.".to_string())?;
    if !canonical.starts_with(root) { return Err("Действие выходит за пределы выбранной папки.".into()); }
    Ok(canonical)
}

#[tauri::command]
pub fn workspace_set_root(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<String, String> {
    let selected = PathBuf::from(path).canonicalize().map_err(|_| "Не удалось открыть выбранную папку.".to_string())?;
    if !selected.is_dir() { return Err("Выберите папку на компьютере.".into()); }
    let config_dir = app.path().app_config_dir().map_err(|_| "Не удалось сохранить настройку рабочей папки.".to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|_| "Не удалось сохранить настройку рабочей папки.".to_string())?;
    std::fs::write(config_dir.join("workspace-root.txt"), selected.to_string_lossy().as_bytes())
        .map_err(|_| "Не удалось сохранить настройку рабочей папки.".to_string())?;
    *state.workspace_root.write() = Some(selected.clone());
    Ok(selected.file_name().and_then(|name| name.to_str()).unwrap_or("Рабочая папка").to_string())
}

#[tauri::command]
pub fn workspace_clear_root(app: AppHandle, state: State<'_, AppState>) {
    *state.workspace_root.write() = None;
    if let Ok(config_dir) = app.path().app_config_dir() { let _ = std::fs::remove_file(config_dir.join("workspace-root.txt")); }
}

#[tauri::command]
pub fn workspace_restore_root(app: AppHandle, state: State<'_, AppState>) -> Option<String> {
    if state.workspace_root.read().is_none() {
        let config = app.path().app_config_dir().ok()?.join("workspace-root.txt");
        let saved = std::fs::read_to_string(config).ok()?;
        let canonical = PathBuf::from(saved).canonicalize().ok()?;
        if !canonical.is_dir() { return None; }
        *state.workspace_root.write() = Some(canonical);
    }
    state.workspace_root.read().as_ref().and_then(|path| path.file_name()).and_then(|name| name.to_str()).map(str::to_owned)
}

#[tauri::command]
pub fn workspace_list_files(state: State<'_, AppState>) -> Result<Vec<WorkspaceEntry>, String> {
    let root = selected_root(&state)?;
    const SKIP: &[&str] = WORKSPACE_SKIP_DIRS;
    const ALLOWED: &[&str] = WORKSPACE_READ_EXTENSIONS;
    let mut result = Vec::new();
    let mut pending = vec![(root.clone(), 0usize)];
    while let Some((directory, depth)) = pending.pop() {
        let entries = std::fs::read_dir(&directory).map_err(|_| "Не удалось просмотреть содержимое папки.".to_string())?;
        for entry in entries.flatten() {
            if result.len() >= 300 { break; }
            let kind = match entry.file_type() { Ok(kind) if !kind.is_symlink() => kind, _ => continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || SKIP.contains(&name.to_ascii_lowercase().as_str()) { continue; }
            let path = entry.path();
            let relative = path.strip_prefix(&root).map_err(|_| "Путь вышел за пределы рабочей папки.".to_string())?;
            let relative_path = relative.to_string_lossy().replace('\\', "/");
            if kind.is_dir() {
                result.push(WorkspaceEntry { name: name.clone(), relative_path, is_dir: true, size: 0 });
                if depth < 2 { pending.push((path, depth + 1)); }
            } else if kind.is_file() {
                let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase();
                let metadata = match entry.metadata() { Ok(value) => value, Err(_) => continue };
                if ALLOWED.contains(&extension.as_str()) && metadata.len() <= 20_000_000 {
                    result.push(WorkspaceEntry { name, relative_path, is_dir: false, size: metadata.len() });
                }
            }
        }
    }
    result.sort_by(|a, b| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()));
    Ok(result)
}

#[tauri::command]
pub fn workspace_read_file(state: State<'_, AppState>, relative_path: String) -> Result<String, String> {
    let root = selected_root(&state)?;
    let relative = safe_relative(&relative_path)?;
    if !is_readable_workspace_path(&relative) { return Err("Этот файл нельзя прочитать из рабочей папки.".into()); }
    let path = root.join(relative);
    let canonical = ensure_inside(&root, &path)?;
    let metadata = std::fs::metadata(&canonical).map_err(|_| "Не удалось прочитать файл.".to_string())?;
    if !metadata.is_file() || metadata.len() > 20_000_000 { return Err("Файл больше 20 МБ или это не обычный файл.".into()); }
    std::fs::read(canonical).map(|bytes| BASE64.encode(bytes)).map_err(|_| "Не удалось прочитать файл.".into())
}

#[tauri::command]
pub fn workspace_write_file(state: State<'_, AppState>, filename: String, bytes_base64: String) -> Result<(), String> {
    let root = selected_root(&state)?;
    let relative = safe_relative(&filename)?;
    if relative.components().count() != 1 { return Err("На первом этапе сохраняйте файл в корень рабочей папки.".into()); }
    let extension = relative.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["md", "txt", "csv", "json", "docx", "pdf", "xlsx", "pptx"].contains(&extension.as_str()) {
        return Err("Этот формат пока нельзя создать в рабочей папке.".into());
    }
    if bytes_base64.len() > 20_000_000 { return Err("Файл больше 15 МБ.".into()); }
    let bytes = BASE64.decode(bytes_base64).map_err(|_| "Некорректное содержимое файла.".to_string())?;
    if bytes.len() > 15_000_000 { return Err("Файл больше 15 МБ.".into()); }
    let destination = root.join(relative);
    if destination.exists() { return Err("Файл с таким именем уже есть. Исходник не перезаписан.".into()); }
    let temporary = root.join(format!(".glow-{}.tmp", uuid::Uuid::new_v4()));
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)
        .map_err(|_| "Не удалось создать файл в рабочей папке.".to_string())?;
    use std::io::Write;
    if file.write_all(&bytes).is_err() || file.sync_all().is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("Не удалось полностью сохранить файл.".into());
    }
    drop(file);
    std::fs::hard_link(&temporary, &destination).map_err(|_| {
        let _ = std::fs::remove_file(&temporary);
        "Не удалось завершить сохранение файла: возможно, имя уже занято.".to_string()
    })?;
    std::fs::remove_file(temporary).map_err(|_| "Файл сохранён, но временную запись не удалось очистить.".to_string())
}

#[tauri::command]
pub fn redact_pii(text: String) -> RedactionResult {
    pii::redact(&text)
}

#[tauri::command]
pub fn game_mode_status(state: State<'_, AppState>) -> GameModeState {
    game_mode::snapshot(&state)
}

#[tauri::command]
pub fn game_mode_set_watchlist(state: State<'_, AppState>, watchlist: Vec<String>) -> GameModeState {
    {
        let mut g = state.game.write();
        g.watchlist = watchlist;
    }
    game_mode::snapshot(&state)
}

#[tauri::command]
pub fn game_mode_force(state: State<'_, AppState>, forced: bool) -> GameModeState {
    {
        let mut g = state.game.write();
        g.forced = forced;
        g.active = forced || g.detected_process.is_some();
    }
    game_mode::snapshot(&state)
}

#[tauri::command]
pub fn mcp_list(state: State<'_, AppState>) -> Vec<McpServerConfig> {
    mcp::list_servers(&state)
}

#[tauri::command]
pub fn mcp_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<McpServerConfig, String> {
    // Refuse enabling heavy agents while game mode is active
    if enabled && state.game.read().active && (id == "chrome" || id == "blender") {
        return Err("Cannot enable heavy MCP agents while Game Mode is active".into());
    }
    mcp::set_enabled(&state, &id, enabled)
}

#[tauri::command]
pub fn focus_assist_hint() -> String {
    // Windows Focus Assist cannot be toggled reliably without undocumented APIs.
    // Return guidance for OS integration.
    "Open Windows Settings → System → Focus to enable Do Not Disturb / Focus Assist.".into()
}

#[tauri::command]
pub fn whisper_transcribe_stub(_audio_path: String) -> Result<String, String> {
    // Local Whisper sidecar placeholder — returns guidance until binary is bundled
    Ok("[Local Whisper] Audio captured. Install whisper.cpp sidecar to enable on-device transcription.".into())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BiomarkerRow {
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub ref_low: Option<f64>,
    pub ref_high: Option<f64>,
    pub out_of_range: bool,
}

#[tauri::command]
pub fn parse_biomarker_text(text: String) -> Vec<BiomarkerRow> {
    let mut rows = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split(|c| c == '\t' || c == ',' || c == '|').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0].to_string();
        let value: f64 = parts[1].replace(',', ".").parse().unwrap_or(f64::NAN);
        if value.is_nan() {
            continue;
        }
        let unit = parts.get(2).unwrap_or(&"").to_string();
        let ref_low = parts.get(3).and_then(|s| s.replace(',', ".").parse().ok());
        let ref_high = parts.get(4).and_then(|s| s.replace(',', ".").parse().ok());
        let out_of_range = match (ref_low, ref_high) {
            (Some(lo), Some(hi)) => value < lo || value > hi,
            (Some(lo), None) => value < lo,
            (None, Some(hi)) => value > hi,
            _ => false,
        };
        rows.push(BiomarkerRow {
            name,
            value,
            unit,
            ref_low,
            ref_high,
            out_of_range,
        });
    }
    rows
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DrugCheckResult {
    pub pair: (String, String),
    pub severity: String,
    pub note: String,
}

#[tauri::command]
pub fn check_drug_interactions(items: Vec<String>) -> Vec<DrugCheckResult> {
    // Built-in conservative interaction heuristics + MCP medical-db hook point
    let known: Vec<(&str, &str, &str, &str)> = vec![
        ("warfarin", "vitamin k", "high", "Vitamin K antagonizes warfarin anticoagulation."),
        ("warfarin", "aspirin", "high", "Increased bleeding risk."),
        ("metformin", "alcohol", "moderate", "Risk of lactic acidosis with heavy alcohol use."),
        ("ssri", "tramadol", "high", "Serotonin syndrome risk."),
        ("st john", "ssri", "high", "Serotonin syndrome risk with St John's wort + SSRI."),
        ("iron", "calcium", "moderate", "Calcium may reduce iron absorption."),
        ("levothyroxine", "calcium", "moderate", "Separate dosing; absorption interference."),
        ("omega-3", "warfarin", "moderate", "May potentiate anticoagulant effect."),
    ];

    let normalized: Vec<String> = items.iter().map(|s| s.trim().to_lowercase()).collect();
    let mut results = Vec::new();
    for i in 0..normalized.len() {
        for j in (i + 1)..normalized.len() {
            let a = &normalized[i];
            let b = &normalized[j];
            for (x, y, sev, note) in &known {
                if (a.contains(x) && b.contains(y)) || (a.contains(y) && b.contains(x)) {
                    results.push(DrugCheckResult {
                        pair: (items[i].clone(), items[j].clone()),
                        severity: (*sev).into(),
                        note: (*note).into(),
                    });
                }
            }
        }
    }
    results
}

#[tauri::command]
pub fn generate_protocol_markdown(
    patient_label: String,
    goals: Vec<String>,
    supplements: Vec<String>,
    diet_notes: String,
) -> String {
    let goals_md = goals
        .iter()
        .map(|g| format!("- {g}"))
        .collect::<Vec<_>>()
        .join("\n");
    let supp_md = supplements
        .iter()
        .map(|s| format!("- {s}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"# Dietary & Supplement Protocol

**Subject label:** {patient_label}  
**Generated by:** Glow Assistant Med Module  
**Disclaimer:** Not a medical device. For educational / clinical decision support only. Verify with licensed clinician.

## Goals
{goals_md}

## Dietary notes
{diet_notes}

## Supplement plan
{supp_md}

## Follow-up
- Recheck biomarkers in 8–12 weeks
- Review drug–supplement interactions before starting
"#
    )
}
