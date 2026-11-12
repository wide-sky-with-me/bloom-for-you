// Self-hosted Web Audio API celesta music-box synthesizer for "予你花开 · Bloom for You"
// Zero external audio dependencies; generates soft pentatonic chimes on user gesture.

const PENTATONIC_FREQ = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
  1046.50, // C6
];

const MELODY_SEQUENCE = [
  { note: 5, beats: 1.5 },
  { note: 7, beats: 1.0 },
  { note: 8, beats: 1.5 },
  { note: 9, beats: 2.0 },
  { note: 8, beats: 1.0 },
  { note: 7, beats: 1.5 },
  { note: 5, beats: 1.5 },
  { note: 3, beats: 2.0 },
  { note: 4, beats: 1.5 },
  { note: 5, beats: 1.0 },
  { note: 7, beats: 1.5 },
  { note: 6, beats: 2.5 },
];

export function createMusicBoxAudio() {
  let ctx = null;
  let masterGain = null;
  let enabled = false;
  let melodyTimer = null;
  let stepIndex = 0;

  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.22;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function playCelestaNote(freq, duration = 2.1, volume = 0.18, delaySec = 0) {
    const audioCtx = ensureContext();
    if (!audioCtx || !enabled) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime + delaySec;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const overtoneGain = audioCtx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    overtoneGain.gain.setValueAtTime(0.12, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.45);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.028);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

    osc1.connect(gain);
    osc2.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
  }

  function scheduleNextMelodyNote() {
    if (!enabled) return;
    const item = MELODY_SEQUENCE[stepIndex % MELODY_SEQUENCE.length];
    const freq = PENTATONIC_FREQ[item.note] || 523.25;
    playCelestaNote(freq, 2.5, 0.13, 0);
    if (stepIndex % 3 === 0) {
      const bassFreq = (PENTATONIC_FREQ[item.note % 5] || 261.63) * 0.5;
      playCelestaNote(bassFreq, 3.5, 0.08, 0.04);
    }
    stepIndex += 1;
    melodyTimer = window.setTimeout(scheduleNextMelodyNote, item.beats * 800);
  }

  function setEnabled(nextState) {
    enabled = Boolean(nextState);
    if (enabled) {
      const audioCtx = ensureContext();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      if (!melodyTimer) scheduleNextMelodyNote();
    } else if (melodyTimer) {
      clearTimeout(melodyTimer);
      melodyTimer = null;
    }
    return enabled;
  }

  function playChime(accentIndex = 0) {
    if (!enabled) return;
    const base = (accentIndex * 2) % 5;
    [base + 4, base + 6, base + 8].forEach((idx, i) => {
      playCelestaNote(PENTATONIC_FREQ[idx % PENTATONIC_FREQ.length], 2.0, 0.14, i * 0.09);
    });
  }

  return {
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    playChime,
  };
}
