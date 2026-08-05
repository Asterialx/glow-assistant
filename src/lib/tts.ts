/** Browser speechSynthesis helpers for reading assistant messages aloud. */

let currentMessageId: string | null = null;

export function isSpeakingMessage(messageId: string): boolean {
  return currentMessageId === messageId && window.speechSynthesis?.speaking === true;
}

export function stopSpeaking() {
  currentMessageId = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  const base = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(base) && /neural|premium|enhanced/i.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    voices.find((v) => v.default) ||
    voices[0] ||
    null
  );
}

/** Speak plain text. Calling again on the same message stops it. */
export function speakText(messageId: string, text: string, lang = "en"): boolean {
  if (!window.speechSynthesis) return false;
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/[#>*_~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return false;

  if (currentMessageId === messageId && window.speechSynthesis.speaking) {
    stopSpeaking();
    return false;
  }

  stopSpeaking();
  const utter = new SpeechSynthesisUtterance(clean.slice(0, 4000));
  utter.lang = lang === "ru" ? "ru-RU" : lang.includes("-") ? lang : `${lang}-${lang.toUpperCase()}`;
  const voice = pickVoice(utter.lang);
  if (voice) utter.voice = voice;

  const speed = localStorage.getItem("glow.voiceSpeed") || "Normal";
  utter.rate = speed === "Slow" ? 0.85 : speed === "Fast" ? 1.2 : 1;

  currentMessageId = messageId;
  utter.onend = () => {
    if (currentMessageId === messageId) currentMessageId = null;
  };
  utter.onerror = () => {
    if (currentMessageId === messageId) currentMessageId = null;
  };

  // Chrome sometimes needs voices loaded asynchronously
  const run = () => window.speechSynthesis.speak(utter);
  if (!window.speechSynthesis.getVoices().length) {
    window.speechSynthesis.onvoiceschanged = () => {
      const v = pickVoice(utter.lang);
      if (v) utter.voice = v;
      run();
    };
  } else {
    run();
  }
  return true;
}
