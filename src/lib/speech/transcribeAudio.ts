/**
 * Speech-to-text for Glow.
 *
 * Voice notes: MediaRecorder file + transcript via Web Speech (when available)
 * and/or local Whisper (transformers.js, single-thread WASM for Cursor/Vite).
 *
 * iOS / WKWebView notes:
 * - `continuous: true` is ignored / broken — use false + restart.
 * - Never hold getUserMedia + Web Speech at once (mic exclusive).
 * - MediaRecorder prefers audio/mp4; PCM→WAV is the reliable Whisper path.
 */

import {
  forceNoAssociatedSink,
  micTrackConstraints,
  openMicAnalyser,
  readRmsLevel,
} from "./micAnalyser";

type AsrPipeline = (
  audio: Float32Array | string,
  opts?: Record<string, unknown>,
) => Promise<{ text?: string }>;

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

let asrPromise: Promise<AsrPipeline> | null = null;

/** iPhone / iPad / iPod (incl. Tauri WKWebView). */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ desktop UA
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function resolveSttLang(localeHint?: string): "ru" | "en" {
  const ui = (localeHint || localStorage.getItem("glow.locale") || "ru").toLowerCase();
  return ui.startsWith("ru") ? "ru" : "en";
}

export function isWebSpeechAvailable(): boolean {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

function createSpeechRecognition(): SpeechRec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function pickRecorderMime(): string {
  const apple = isAppleMobile();
  const candidates = apple
    ? ["audio/mp4", "audio/aac", "audio/wav", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return apple ? "audio/mp4" : "audio/webm";
}

export type VoiceRecorder = {
  stop: () => Promise<Blob>;
  abort: () => void;
};

function audioContextCtor(): typeof AudioContext {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  );
}

/** Mic + MediaRecorder. Levels via analyser (never routed to speakers). */
export async function startVoiceRecorder(
  deviceId?: string,
  onLevel?: (n: number) => void,
): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: isAppleMobile() ? true : micTrackConstraints(deviceId),
  });
  if (!isAppleMobile()) await forceNoAssociatedSink(stream);

  let meter: Awaited<ReturnType<typeof openMicAnalyser>> | null = null;
  let raf = 0;
  try {
    meter = await openMicAnalyser(stream);
    const data = new Uint8Array(meter.analyser.fftSize);
    const tick = () => {
      if (meter) onLevel?.(readRmsLevel(meter.analyser, data));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    console.warn("Mic level meter unavailable", e);
  }

  const mime = pickRecorderMime();
  const chunks: Blob[] = [];
  let mr: MediaRecorder;
  try {
    mr = isAppleMobile()
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
  } catch {
    try {
      mr = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      mr = new MediaRecorder(stream);
    }
  }
  const usedMime = mr.mimeType || mime;
  mr.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  // iOS: timeslice can yield empty blobs — collect on stop too
  try {
    mr.start(isAppleMobile() ? 1000 : 250);
  } catch {
    mr.start();
  }

  let stopped = false;
  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream.getTracks().forEach((t) => t.stop());
    meter?.stop();
    meter = null;
  };

  return {
    stop: () =>
      new Promise((resolve) => {
        if (stopped) {
          resolve(new Blob(chunks, { type: usedMime }));
          return;
        }
        stopped = true;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve(new Blob(chunks, { type: usedMime }));
        };
        if (mr.state === "inactive") {
          finish();
          return;
        }
        mr.onstop = finish;
        try {
          mr.requestData();
        } catch {
          /* ignore */
        }
        try {
          mr.stop();
        } catch {
          finish();
        }
        window.setTimeout(finish, 1500);
      }),
    abort: () => {
      if (stopped) return;
      stopped = true;
      try {
        if (mr.state !== "inactive") mr.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };
}

/**
 * PCM capture → WAV. Most reliable Whisper path on iOS when MediaRecorder
 * is flaky or Web Speech is unavailable.
 */
export async function startPcmVoiceCapture(
  deviceId?: string,
  onLevel?: (n: number) => void,
): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: isAppleMobile() ? true : micTrackConstraints(deviceId),
  });
  if (!isAppleMobile()) await forceNoAssociatedSink(stream);

  const Ctx = audioContextCtor();
  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];
  const sampleRate = ctx.sampleRate;
  let stopped = false;

  // ScriptProcessor is deprecated but widely available on iOS WKWebView.
  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  processor.onaudioprocess = (ev) => {
    if (stopped) return;
    const input = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    if (onLevel) {
      let s = 0;
      for (let i = 0; i < input.length; i++) s += input[i]! * input[i]!;
      onLevel(Math.min(1, Math.sqrt(s / input.length) * 6));
    }
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  const cleanup = () => {
    stopped = true;
    try {
      processor.disconnect();
      source.disconnect();
      silent.disconnect();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };

  return {
    stop: async () => {
      if (stopped && chunks.length === 0) return encodeWavMono16(new Float32Array(0), sampleRate);
      let total = 0;
      for (const c of chunks) total += c.length;
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }
      cleanup();
      return encodeWavMono16(merged, sampleRate);
    },
    abort: () => {
      chunks.length = 0;
      cleanup();
    },
  };
}

/** Prefer PCM on Apple; MediaRecorder elsewhere (with PCM fallback). */
export async function startBestVoiceRecorder(
  deviceId?: string,
  onLevel?: (n: number) => void,
): Promise<VoiceRecorder> {
  if (isAppleMobile()) {
    try {
      return await startPcmVoiceCapture(deviceId, onLevel);
    } catch (e) {
      console.warn("PCM capture failed, trying MediaRecorder", e);
      return startVoiceRecorder(deviceId, onLevel);
    }
  }
  try {
    return await startVoiceRecorder(deviceId, onLevel);
  } catch (e) {
    console.warn("MediaRecorder failed, trying PCM", e);
    return startPcmVoiceCapture(deviceId, onLevel);
  }
}

export function encodeWavMono16(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function resampleTo16k(pcm: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return pcm;
  const ratio = sampleRate / 16000;
  const newLen = Math.max(1, Math.floor(pcm.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) out[i] = pcm[Math.floor(i * ratio)] ?? 0;
  return out;
}

export async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  // WAV we produced ourselves — decode without AudioContext when possible
  if ((blob.type || "").includes("wav") || blob.size > 44) {
    try {
      const pcm = tryDecodeWavPcm(await blob.arrayBuffer());
      if (pcm) return pcm;
    } catch {
      /* fall through */
    }
  }

  const raw = await blob.arrayBuffer();
  const typeHint = (blob.type || "").split(";")[0] || "";
  // Try as-is, then with normalized MIME (helps Chromium + iOS mp4/aac).
  const attempts: Blob[] = [
    new Blob([raw], { type: typeHint || "audio/webm" }),
    new Blob([raw], { type: "audio/mp4" }),
    new Blob([raw], { type: "audio/aac" }),
    new Blob([raw], { type: "audio/wav" }),
    new Blob([raw], { type: "audio/webm" }),
    new Blob([raw], { type: "audio/mpeg" }),
  ];

  const Ctx = audioContextCtor();

  let lastErr: unknown;
  for (const candidate of attempts) {
    const ctx = new Ctx();
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const ab = await candidate.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      const ch0 = decoded.getChannelData(0);
      let mono = ch0;
      if (decoded.numberOfChannels > 1) {
        const ch1 = decoded.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i]! + (ch1[i] ?? 0)) * 0.5;
      }
      return resampleTo16k(mono, decoded.sampleRate);
    } catch (e) {
      lastErr = e;
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("decodeAudioData failed");
}

/** Fast path for our encodeWavMono16 output (skips AudioContext on iOS). */
function tryDecodeWavPcm(ab: ArrayBuffer): Float32Array | null {
  if (ab.byteLength < 44) return null;
  const view = new DataView(ab);
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== "RIFF") return null;
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  if (bits !== 16 || channels < 1) return null;
  // Find data chunk (skip extra chunks)
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size;
  }
  if (dataOffset < 0) return null;
  const samples = Math.floor(dataSize / 2 / channels);
  const mono = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) {
      s += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 0x8000;
    }
    mono[i] = s / channels;
  }
  return resampleTo16k(mono, sampleRate);
}

function rms(pcm: Float32Array): number {
  if (!pcm.length) return 0;
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / pcm.length);
}

function prefersFp32Whisper(): boolean {
  // q8 Whisper breaks on ORT 1.25+ (MatMulNBits / missing scale) — common on phones.
  if (typeof navigator === "undefined") return false;
  if (isAppleMobile()) return true;
  return /Android|Mobile/i.test(navigator.userAgent || "");
}

async function loadAsr(): Promise<AsrPipeline> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.allowRemoteModels = true;
      // Cursor / Vite are usually NOT crossOriginIsolated — multi-thread WASM crashes.
      try {
        const wasm = (env.backends as { onnx?: { wasm?: Record<string, unknown> } })?.onnx?.wasm;
        if (wasm) {
          wasm.numThreads = 1;
          wasm.proxy = false;
        }
      } catch {
        /* ignore */
      }

      const modelId = "Xenova/whisper-tiny";
      // q8 is broken in transformers@4.2 + ORT 1.25 (Missing required scale / MatMulNBits).
      // Prefer fp32 on mobile; try q8 first on desktop then fall back.
      const dtypes = prefersFp32Whisper()
        ? (["fp32", "fp16", "q8"] as const)
        : (["q8", "fp32"] as const);

      let lastErr: unknown;
      for (const dtype of dtypes) {
        try {
          const pipe = await pipeline("automatic-speech-recognition", modelId, {
            dtype,
            device: "wasm",
          });
          return pipe as unknown as AsrPipeline;
        } catch (e) {
          lastErr = e;
          console.warn(`Whisper load failed (dtype=${dtype})`, e);
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error("Whisper model failed to load");
    })().catch((err) => {
      asrPromise = null;
      throw err;
    });
  }
  return asrPromise;
}

async function whisperLocalBlob(blob: Blob, language: "ru" | "en"): Promise<string> {
  const pcm = await blobToPcm16k(blob);
  if (pcm.length < 1600) {
    throw new Error(
      language === "ru"
        ? "Слишком короткая запись — говорите 2–3 секунды."
        : "Recording too short — speak 2–3 seconds.",
    );
  }
  // Soft threshold — don't reject quiet mics too aggressively
  if (rms(pcm) < 0.0004) {
    throw new Error(
      language === "ru"
        ? "Почти тишина. Говорите громче и ближе к микрофону."
        : "Almost silence. Speak louder / closer to the mic.",
    );
  }

  const asr = await loadAsr();
  const opts = {
    language: language === "ru" ? "russian" : "english",
    task: "transcribe",
    chunk_length_s: 30,
    return_timestamps: false,
  };

  // 1) Float32 PCM (preferred)
  try {
    const result = await asr(pcm, opts);
    const text = (result.text || "").trim();
    if (text) return text;
  } catch (e) {
    console.warn("ASR pcm failed, trying wav url", e);
  }

  // 2) WAV object URL fallback
  const wav = encodeWavMono16(pcm, 16000);
  const url = URL.createObjectURL(wav);
  try {
    const result = await asr(url, opts);
    return (result.text || "").trim();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type TranscribeProgress = (
  phase: "cloud" | "loading-model" | "transcribing",
) => void;

export async function transcribeAudioBlob(
  blob: Blob,
  locale: "ru" | "en" = "ru",
  onProgress?: TranscribeProgress,
): Promise<string> {
  const lang = resolveSttLang(locale);
  if (blob.size < 500) {
    throw new Error(
      lang === "ru"
        ? "Слишком короткая запись — говорите 2–3 секунды."
        : "Recording too short — speak 2–3 seconds.",
    );
  }

  onProgress?.("loading-model");
  try {
    await loadAsr();
    onProgress?.("transcribing");
    const text = await whisperLocalBlob(blob, lang);
    if (!text) {
      throw new Error(
        lang === "ru"
          ? "Пустой результат. Говорите чётче 2–3 секунды."
          : "Empty transcript. Speak clearly for 2–3 seconds.",
      );
    }
    return text;
  } catch (e) {
    console.error("Local Whisper failed", e);
    const detail = e instanceof Error ? e.message : String(e);
    if (/коротк|тишина|silence|short|пустой|Empty|чётче|громче/i.test(detail)) {
      throw e instanceof Error ? e : new Error(detail);
    }
    if (/MatMulNBits|Missing required scale|Can't create a session|qdq_actions/i.test(detail)) {
      throw new Error(
        lang === "ru"
          ? "Модель распознавания не загрузилась. Обнови страницу и попробуй ещё раз (первый раз качается ~40 МБ)."
          : "Speech model failed to load. Refresh and try again (first run downloads ~40 MB).",
      );
    }
    throw new Error(
      lang === "ru"
        ? `Не удалось распознать речь.\n${detail}`
        : `Could not transcribe.\n${detail}`,
    );
  }
}

export async function transcribePcm(
  pcm: Float32Array,
  sampleRate: number,
  locale: "ru" | "en" = "ru",
  onProgress?: TranscribeProgress,
): Promise<string> {
  const lang = resolveSttLang(locale);
  const pcm16 = resampleTo16k(pcm, sampleRate);
  const wav = encodeWavMono16(pcm16, 16000);
  return transcribeAudioBlob(wav, lang, onProgress);
}

export type LiveSpeechHandle = {
  getText: () => string;
  stop: () => Promise<string>;
  abort: () => void;
};

/**
 * Live Web Speech.
 * On Apple: continuous=false + auto-restart (required). Do not open mic streams alongside.
 */
export function startLiveSpeech(
  lang: "ru" | "en",
  onUpdate?: (text: string, interim: string) => void,
  onFatal?: (code: string) => void,
): LiveSpeechHandle | null {
  const rec = createSpeechRecognition();
  if (!rec) return null;

  const apple = isAppleMobile();
  let finalText = "";
  let interim = "";
  let stopped = false;
  let fatal: string | null = null;
  let endResolve: ((t: string) => void) | null = null;
  let restartTimer = 0;

  // iOS ignores / breaks continuous:true — must be false and restart on end.
  rec.continuous = !apple;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = lang === "ru" ? "ru-RU" : "en-US";

  rec.onresult = (ev) => {
    let f = finalText;
    let i = "";
    for (let idx = ev.resultIndex; idx < ev.results.length; idx++) {
      const row = ev.results[idx];
      if (!row) continue;
      const piece = (row[0]?.transcript || "").trim();
      if (!piece) continue;
      if (row.isFinal) f = f ? `${f} ${piece}` : piece;
      else i = i ? `${i} ${piece}` : piece;
    }
    finalText = f;
    interim = i;
    onUpdate?.(finalText.trim(), interim.trim());
  };

  rec.onerror = (ev) => {
    const code = ev.error || "error";
    // iOS fires no-speech often between restarts — ignore
    if (code === "no-speech" || code === "aborted") return;
    fatal = code;
    onFatal?.(code);
  };

  rec.onend = () => {
    if (!stopped && !fatal) {
      // Small delay helps iOS recover the session
      restartTimer = window.setTimeout(() => {
        if (stopped || fatal) return;
        try {
          rec.start();
        } catch {
          /* already started / stopped */
        }
      }, apple ? 120 : 0);
      return;
    }
    endResolve?.(finalText.trim() || interim.trim());
    endResolve = null;
  };

  try {
    rec.start();
  } catch (e) {
    console.warn("Web Speech start failed", e);
    return null;
  }

  return {
    getText: () => finalText.trim() || interim.trim(),
    stop: () =>
      new Promise((resolve) => {
        if (restartTimer) {
          window.clearTimeout(restartTimer);
          restartTimer = 0;
        }
        if (fatal) {
          resolve(finalText.trim() || interim.trim());
          return;
        }
        stopped = true;
        endResolve = resolve;
        try {
          rec.stop();
        } catch {
          resolve(finalText.trim() || interim.trim());
        }
        window.setTimeout(() => {
          resolve(finalText.trim() || interim.trim());
        }, apple ? 800 : 1200);
      }),
    abort: () => {
      if (restartTimer) {
        window.clearTimeout(restartTimer);
        restartTimer = 0;
      }
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

export function startPcmCapture(_stream: MediaStream): {
  stop: () => Float32Array;
  sampleRate: number;
} {
  return { sampleRate: 48000, stop: () => new Float32Array(0) };
}

export function prefetchSpeechModel() {
  void loadAsr().catch((e) => {
    console.warn("Whisper prefetch failed", e);
    asrPromise = null;
  });
}
