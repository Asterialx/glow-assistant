import { AppShell } from "./components/layout/AppShell";
import { useVisualViewportHeight } from "./lib/useVisualViewport";

export default function App() {
  useVisualViewportHeight();
  return <AppShell />;
}
