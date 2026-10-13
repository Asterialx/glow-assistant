let worker: Worker | null = null;
const pending = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export function stopPython() {
  worker?.terminate(); worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error("Python остановлен; переменные ядра сброшены.")); }
  pending.clear();
}
/** Run outside the UI thread, without DOM or localStorage access. */
export function runPythonCell(id: string, code: string): Promise<string> {
  if (!worker) {
    worker = new Worker("/glow-python-worker.js");
    worker.onmessage = event => {
      const job = pending.get(event.data.request); if (!job) return;
      clearTimeout(job.timer); pending.delete(event.data.request);
      if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.output);
    };
    worker.onerror = () => stopPython();
  }
  const request = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(stopPython, 90000);
    pending.set(request, { resolve, reject, timer });
    worker!.postMessage({ request, id, code });
  });
}
