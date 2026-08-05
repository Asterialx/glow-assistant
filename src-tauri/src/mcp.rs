use crate::state::{AppState, McpServerConfig};

pub fn list_servers(state: &AppState) -> Vec<McpServerConfig> {
    state.mcp.read().clone()
}

pub fn set_enabled(state: &AppState, id: &str, enabled: bool) -> Result<McpServerConfig, String> {
    let mut servers = state.mcp.write();
    let server = servers
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("MCP server not found: {id}"))?;
    server.enabled = enabled;
    Ok(server.clone())
}
