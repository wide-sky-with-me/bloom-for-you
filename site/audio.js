// Web Audio API synthesizer for the Van Gogh Starry Night & Flower Meadow
// Provides delicate celesta / music-box notes, chime arpeggios, and ambient night pad.

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

export function createNightAudio() {
  let ctx = null;
  let masterGain = null;
  let enabled = false;
  let melodyTimer = null;
  let stepIndex = 0;

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.24;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function playCelestaNote(freq, duration = 2.1, volume = 0.2, delaySec = 0) {
    const audioCtx = ensureContext();
    if (!audioCtx || !enabled) {
      return;
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime + delaySec;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    const overtoneGain = audioCtx.createGain();
    overtoneGain.gain.setValueAtTime(0.14, now);
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
    if (!enabled) {
      return;
    }
    const item = MELODY_SEQUENCE[stepIndex % MELODY_SEQUENCE.length];
    const freq = PENTATONIC_FREQ[item.note] || 523.25;
    playCelestaNote(freq, 2.5, 0.14, 0);
    if (stepIndex % 3 === 0) {
      const bassFreq = (PENTATONIC_FREQ[item.note % 5] || 261.63) * 0.5;
      playCelestaNote(bassFreq, 3.6, 0.09, 0.04);
    }
    stepIndex += 1;
    melodyTimer = window.setTimeout(scheduleNextMelodyNote, item.beats * 780);
  }

  function setEnabled(nextState) {
    enabled = Boolean(nextState);
    if (enabled) {
      const audioCtx = ensureContext();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      if (!melodyTimer) {
        scheduleNextMelodyNote();
      }
    } else if (melodyTimer) {
      clearTimeout(melodyTimer);
      melodyTimer = null;
    }
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  function playDiscoveryChime(accentIndex = 0) {
    if (!enabled) {
      return;
    }
    const base = (accentIndex * 2) % 5;
    const chord = [base + 4, base + 6, base + 7, base + 9];
    chord.forEach((idx, i) => {
      const freq = PENTATONIC_FREQ[idx % PENTATONIC_FREQ.length];
      playCelestaNote(freq, 2.4, 0.18, i * 0.11);
    });
  }

  function playRippleSparkle() {
    if (!enabled) {
      return;
    }
    const pick = 6 + Math.floor(Math.random() * 5);
    playCelestaNote(PENTATONIC_FREQ[pick], 1.2, 0.08, 0);
  }

  function playWonderTwinkle(seed = 0) {
    if (!enabled) {
      return;
    }
    const base = 5 + (Math.abs(seed) % 4);
    const notes = [base, base + 2, base + 4];
    notes.forEach((idx, i) => {
      const freq = PENTATONIC_FREQ[idx % PENTATONIC_FREQ.length];
      playCelestaNote(freq, 1.5, 0.14, i * 0.075);
    });
  }

  function playFinaleFanfare() {
    if (!enabled) {
      return;
    }
    const notes = [0, 2, 3, 4, 5, 7, 8, 9, 10];
    notes.forEach((idx, i) => {
      playCelestaNote(PENTATONIC_FREQ[idx], 3.0, 0.2, i * 0.12);
    });
  }

  return {
    isEnabled: () => enabled,
    setEnabled,
    toggle,
    playDiscoveryChime,
    playWonderTwinkle,
    playRippleSparkle,
    playFinaleFanfare,
  };
}
