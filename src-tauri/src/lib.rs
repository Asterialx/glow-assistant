mod code_tools;
mod commands;
mod game_mode;
mod git_tools;
mod mcp;
mod pii;
mod policy;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::redact_pii,
            commands::game_mode_status,
            commands::game_mode_set_watchlist,
            commands::game_mode_force,
            commands::mcp_list,
            commands::mcp_set_enabled,
            commands::focus_assist_hint,
            commands::whisper_transcribe_stub,
            commands::parse_biomarker_text,
            commands::check_drug_interactions,
            commands::generate_protocol_markdown,
            commands::workspace_set_root,
            commands::workspace_clear_root,
            commands::workspace_restore_root,
            commands::workspace_list_files,
            commands::workspace_read_file,
            commands::workspace_write_file,
            commands::export_save_file,
            code_tools::code_list,
            code_tools::code_read,
            code_tools::code_search,
            code_tools::code_edit,
            code_tools::code_create,
            code_tools::code_delete,
            code_tools::code_run,
            code_tools::code_classify_command,
            code_tools::code_restore_checkpoint,
            git_tools::git_status,
            git_tools::git_diff,
            git_tools::git_log,
            git_tools::git_branch,
            git_tools::git_commit,
            git_tools::git_current_branch,
            git_tools::checkpoint_begin,
            git_tools::checkpoint_finish,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                game_mode::run_watcher(handle, state).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Glow Assistant");
}
