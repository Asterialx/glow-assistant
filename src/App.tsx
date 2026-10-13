import { lazy, Suspense } from "react";
import { AuthGate } from "./auth/AuthGate";
import { Sparkles } from "lucide-react";

function GlowLoading() {
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--bg)] px-6 text-[var(--fg)]" role="status" aria-live="polite">
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] opacity-[0.07] blur-[100px]" />
    <div className="relative flex w-full max-w-sm flex-col items-center text-center">
      <div className="relative mb-8 grid size-[4.5rem] place-items-center rounded-[1.6rem] border border-[var(--accent)]/25 bg-[var(--bg-elevated)] shadow-[0_12px_60px_var(--shadow)]">
        <img src="/glow-mark.png" alt="" className="size-10 object-contain" />
        <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] text-white"><Sparkles size={12} /></span>
      </div>
      <h1 className="font-display text-3xl tracking-tight">Glow <span className="text-[var(--accent)]">просыпается</span></h1>
      <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--fg-muted)]">Подготавливаем ваше пространство и загружаем данные. Это займёт всего несколько секунд.</p>
      <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-[var(--bg-hover)]"><div className="h-full w-2/5 animate-[glow-loading_1.6s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" /></div>
      <span className="mt-3 text-xs tracking-wide text-[var(--fg-faint)]">ЗАГРУЖАЕМ ВАШЕ ПРОСТРАНСТВО</span>
    </div>
    <style>{`@keyframes glow-loading { 0% { transform: translateX(-110%); opacity: .55 } 50% { opacity: 1 } 100% { transform: translateX(360%); opacity: .55 } }`}</style>
  </main>;
}

const Workspace = lazy(() => import("./Workspace"));

export default function App() {
  return <AuthGate><Suspense fallback={<GlowLoading />}><Workspace /></Suspense></AuthGate>;
}
