import { lazy, Suspense } from "react";
import { AuthGate } from "./auth/AuthGate";
const Workspace = lazy(() => import("./Workspace"));

export default function App() {
  return <AuthGate><Suspense fallback={<div role="status">Открываем Glow…</div>}><Workspace /></Suspense></AuthGate>;
}
