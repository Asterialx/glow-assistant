use crate::game_mode;
use crate::mcp;
use crate::pii::{self, RedactionResult};
use crate::state::{AppState, GameModeState, McpServerConfig};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntryDto {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntryDto>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().ok();
        out.push(DirEntryDto {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.map(|m| m.is_dir()).unwrap_or(false),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

#[tauri::command]
pub fn run_shell_command(command: String, cwd: Option<String>) -> Result<ShellResult, String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-c", &command]);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    Ok(ShellResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
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
