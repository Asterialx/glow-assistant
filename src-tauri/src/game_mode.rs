use crate::state::{AppState, GameModeState};
use sysinfo::System;
use tauri::{AppHandle, Emitter};

pub async fn run_watcher(app: AppHandle, state: AppState) {
    let mut sys = System::new_all();
    let mut was_active = false;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let (forced, watchlist) = {
            let g = state.game.read();
            (g.forced, g.watchlist.clone())
        };

        let mut detected: Option<String> = None;
        if !forced {
            for (_pid, process) in sys.processes() {
                let name = process.name().to_string_lossy().to_string();
                let lower = name.to_lowercase();
                if watchlist.iter().any(|w| w.to_lowercase() == lower) {
                    detected = Some(name);
                    break;
                }
            }
        }

        let active = forced || detected.is_some();
        {
            let mut g = state.game.write();
            g.active = active;
            g.detected_process = if forced {
                Some("forced".into())
            } else {
                detected.clone()
            };
        }

        if active != was_active {
            was_active = active;
            let payload = state.game.read().clone();
            let _ = app.emit("game-mode", payload);
            if active {
                // Pause heavy subsystems signal — frontend + future sidecars listen
                let _ = app.emit("subsystems-pause", true);
            } else {
                let _ = app.emit("subsystems-resume", true);
            }
        }
    }
}

pub fn snapshot(state: &AppState) -> GameModeState {
    state.game.read().clone()
}
