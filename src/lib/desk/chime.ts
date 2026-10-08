const KEY = "sanctum-chime";
const OFFLINE_KEY = "sanctum-offline-notice";
const AUDIO_KEY = "sanctum-audio-out";
const MIC_KEY = "sanctum-mic";

export function chimeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(KEY) !== "off" && audioOutEnabled();
}

export function setChimeEnabled(on: boolean): void {
  window.localStorage.setItem(KEY, on ? "on" : "off");
}

export function audioOutEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AUDIO_KEY) !== "off";
}

export function setAudioOutEnabled(on: boolean): void {
  window.localStorage.setItem(AUDIO_KEY, on ? "on" : "off");
}

export function micEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MIC_KEY) !== "off";
}

export function setMicEnabled(on: boolean): void {
  window.localStorage.setItem(MIC_KEY, on ? "on" : "off");
}

export function offlineNoticeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OFFLINE_KEY) === "on";
}

export function setOfflineNoticeEnabled(on: boolean): void {
  window.localStorage.setItem(OFFLINE_KEY, on ? "on" : "off");
}

function beepPair(a: number, b: number) {
  if (typeof window === "undefined") return;
  if (!audioOutEnabled()) return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const beep = (t: number, freq: number, dur: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  beep(now, a, 0.12);
  beep(now + 0.14, b, 0.16);
  window.setTimeout(() => void ctx.close(), 600);
}

/** Short two-note sign-on. Not a linger ping. */
export function playSignOnChime(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(KEY) === "off") return;
  beepPair(523.25, 659.25);
}

/** Inbound message. Distinct from the sign-on pair: a short high ping. */
export function playReceiveChime(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(KEY) === "off") return;
  if (!audioOutEnabled()) return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const ping = (t: number, freq: number, dur: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  ping(now, 988, 0.09);
  ping(now + 0.11, 1319, 0.14);
  window.setTimeout(() => void ctx.close(), 500);
}

/** MSN-style nudge: two short notes when a ghost sees you. */
export function playNudgeChime(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(KEY) === "off") return;
  if (!audioOutEnabled()) return;
  beepPair(659.25, 880);
}
