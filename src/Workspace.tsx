import { AppShell } from "./components/layout/AppShell";
import { initUiTheme } from "./stores/uiStore";

// Loaded only after AuthGate selects the account's storage namespace.
initUiTheme();
export default function Workspace() { return <AppShell />; }
