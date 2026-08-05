mod commands;
mod game_mode;
mod mcp;
mod pii;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must run before other plugins that touch the webview on iOS.
    #[cfg(target_os = "ios")]
    {
        builder = builder.plugin(tauri_plugin_ios_webview_insets::init());
    }

    builder
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
            commands::list_directory,
            commands::read_text_file,
            commands::write_text_file,
            commands::run_shell_command,
            commands::mcp_list,
            commands::mcp_set_enabled,
            commands::focus_assist_hint,
            commands::whisper_transcribe_stub,
            commands::parse_biomarker_text,
            commands::check_drug_interactions,
            commands::generate_protocol_markdown,
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
