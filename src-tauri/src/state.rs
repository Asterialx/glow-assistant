use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameModeState {
    pub active: bool,
    pub detected_process: Option<String>,
    pub watchlist: Vec<String>,
    pub forced: bool,
}

impl Default for GameModeState {
    fn default() -> Self {
        Self {
            active: false,
            detected_process: None,
            watchlist: vec![
                "osu!.exe".into(),
                "osu.exe".into(),
                "ModernWarfare.exe".into(),
                "cod.exe".into(),
                "cod22-cod.exe".into(),
                "Warzone.exe".into(),
            ],
            forced: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command_or_url: String,
    pub args: Vec<String>,
    pub enabled: bool,
    pub category: String,
}

#[derive(Clone)]
pub struct AppState {
    pub game: Arc<RwLock<GameModeState>>,
    pub mcp: Arc<RwLock<Vec<McpServerConfig>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            game: Arc::new(RwLock::new(GameModeState::default())),
            mcp: Arc::new(RwLock::new(default_mcp_servers())),
        }
    }
}

fn default_mcp_servers() -> Vec<McpServerConfig> {
    vec![
        McpServerConfig {
            id: "filesystem".into(),
            name: "Filesystem".into(),
            transport: "stdio".into(),
            command_or_url: "npx".into(),
            args: vec![
                "-y".into(),
                "@modelcontextprotocol/server-filesystem".into(),
            ],
            enabled: false,
            category: "files".into(),
        },
        McpServerConfig {
            id: "vscode".into(),
            name: "VS Code / Cursor".into(),
            transport: "stdio".into(),
            command_or_url: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-filesystem".into()],
            enabled: false,
            category: "ide".into(),
        },
        McpServerConfig {
            id: "blender".into(),
            name: "Blender".into(),
            transport: "stdio".into(),
            command_or_url: "blender-mcp".into(),
            args: vec![],
            enabled: false,
            category: "design".into(),
        },
        McpServerConfig {
            id: "roblox".into(),
            name: "Roblox Studio".into(),
            transport: "stdio".into(),
            command_or_url: "roblox-studio-mcp".into(),
            args: vec![],
            enabled: false,
            category: "game-dev".into(),
        },
        McpServerConfig {
            id: "unity".into(),
            name: "Unity".into(),
            transport: "stdio".into(),
            command_or_url: "unity-mcp".into(),
            args: vec![],
            enabled: false,
            category: "game-dev".into(),
        },
        McpServerConfig {
            id: "medical-db".into(),
            name: "Medical Drug DB".into(),
            transport: "stdio".into(),
            command_or_url: "medical-mcp".into(),
            args: vec![],
            enabled: false,
            category: "medical".into(),
        },
        McpServerConfig {
            id: "chrome".into(),
            name: "Chrome Agent (Playwright)".into(),
            transport: "stdio".into(),
            command_or_url: "npx".into(),
            args: vec!["-y".into(), "@playwright/mcp@latest".into()],
            enabled: false,
            category: "browser".into(),
        },
    ]
}

#[allow(dead_code)]
pub type SharedMap = Arc<RwLock<HashMap<String, String>>>;
