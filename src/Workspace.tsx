import { AppShell } from "./components/layout/AppShell";
import { initUiTheme } from "./stores/uiStore";
import { useMobileViewport } from "./hooks/useMobileViewport";

// Loaded only after AuthGate selects the account's storage namespace.
initUiTheme();
export default function Workspace() { useMobileViewport(); return <AppShell />; }
