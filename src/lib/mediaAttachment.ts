import type { ChatAttachment } from "./attachments";
import { imageForModel } from "./attachments";

export const MEDIA_MAX_SECONDS = 600;
export function mediaFrameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MEDIA_MAX_SECONDS) throw new Error("Прикрепите запись длительностью до 10 минут.");
  return [0.1, 0.5, 0.9].map(ratio => duration * ratio);
}
export function mediaTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
async function transcribe(file: File, locale: string): Promise<string> {
  // Reject long compressed recordings before allocating a decoded PCM buffer.
  const probe = document.createElement("audio"), url = URL.createObjectURL(file);
  try {
    const metadata = mediaEvent(probe, "loadedmetadata"); probe.preload = "metadata"; probe.src = url; probe.load(); await metadata;
    if (!Number.isFinite(probe.duration)) { const end = mediaEvent(probe, "seeked"); probe.currentTime = 1e10; await end; }
    mediaFrameTimes(probe.duration);
  } finally { probe.removeAttribute("src"); probe.load(); URL.revokeObjectURL(url); }
  const { blobToPcm16k, transcribePcm, resolveSttLang } = await import("./speech/transcribeAudio");
  let pcm: Float32Array;
  try { pcm = await blobToPcm16k(file); }
  catch { throw new Error(`${file.name}: не удалось прочитать звуковую дорожку. Попробуйте MP3, WAV или M4A.`); }
  const duration = pcm.length / 16000;
  mediaFrameTimes(duration);
  const parts: string[] = [];
  for (let start = 0; start < pcm.length; start += 30 * 16000) {
    const chunk = pcm.slice(start, start + 30 * 16000);
    if (chunk.every(value => Math.abs(value) < 0.001)) continue;
    try {
      const text = await transcribePcm(chunk, 16000, resolveSttLang(locale));
      if (text.trim()) parts.push(`[${mediaTime(start / 16000)}] ${text.trim()}`);
    } catch (error) {
      throw new Error(`${file.name}: не удалось распознать фрагмент ${mediaTime(start / 16000)}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!parts.length) throw new Error(`${file.name}: в записи не удалось распознать речь.`);
  return `Автоматическая расшифровка речи (${mediaTime(duration)}). Возможны ошибки, особенно в именах и числах: не считай их подтверждёнными без проверки. Таймкоды приблизительные; голоса и другие звуки не анализировались.\n${parts.join("\n")}`;
}
function mediaEvent(video: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener("error", failed); };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Не удалось открыть запись. Попробуйте MP4 (H.264), WebM, MP3 или WAV.")); };
    const timer = setTimeout(failed, 15000);
    video.addEventListener(event, ready, { once: true }); video.addEventListener("error", failed, { once: true });
  });
}
export async function prepareMedia(file: File, videoFile: boolean, locale = "ru"): Promise<ChatAttachment[]> {
  if (!videoFile) return [{ name: file.name, text: await transcribe(file, locale) }];
  const video = document.createElement("video"); video.muted = true; video.preload = "auto"; video.playsInline = true;
  const url = URL.createObjectURL(file);
  try {
    const loaded = mediaEvent(video, "loadeddata"); video.src = url; video.load(); await loaded;
    // MediaRecorder WebM often omits duration metadata; seeking discovers EOF.
    if (!Number.isFinite(video.duration)) {
      const end = mediaEvent(video, "seeked"); video.currentTime = 1e10; await end;
    }
    const times = mediaFrameTimes(video.duration);
    if (!video.videoWidth || !video.videoHeight) return [{ name: file.name, text: await transcribe(file, locale) }];
    const frames: ChatAttachment[] = [];
    for (const time of times) {
      const seek = mediaEvent(video, "seeked"); video.currentTime = time; await seek;
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Не удалось прочитать кадр видео.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Не удалось прочитать кадр.")), "image/jpeg", 0.85));
      frames.push({ name: `${file.name} · кадр ${mediaTime(time)}`, image: await imageForModel(new File([blob], "frame.jpg", { type: "image/jpeg" })) });
    }
    let speech: string;
    try { speech = await transcribe(file, locale); }
    catch (error) { speech = `Речь недоступна: ${error instanceof Error ? error.message : String(error)} Не делай выводов о звуке.`; }
    return [{ name: file.name, text: `Видео ${mediaTime(video.duration)}. Переданы только 3 отдельных кадра с таймкодами, не непрерывное видео. Не утверждай, что видел события между кадрами.\n${speech}` }, ...frames];
  } finally { video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
