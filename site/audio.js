// Self-hosted Web Audio API sunshower harbor & celesta music-box synthesizer
// Zero external audio dependencies; unlocks cleanly on user interaction with 3D miniature objects.

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

export function createHarborAudio() {
  let ctx = null;
  let masterGain = null;

  function ensureUnlocked() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.24;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, duration = 1.6, volume = 0.16, delaySec = 0, type = "sine") {
    const audioCtx = ensureUnlocked();
    if (!audioCtx) return;
    const now = audioCtx.currentTime + delaySec;
    const osc = audioCtx.createOscillator();
    const overtone = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const overGain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    overtone.type = "triangle";
    overtone.frequency.setValueAtTime(freq * 2.0, now);

    overGain.gain.setValueAtTime(0.09, now);
    overGain.gain.exponentialRampToValueAtTime(0.0008, now + duration * 0.45);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

    osc.connect(gain);
    overtone.connect(overGain);
    overGain.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + duration + 0.04);
    overtone.stop(now + duration + 0.04);
  }

  function playRoofChime(opened = true) {
    const seq = opened ? [5, 6, 7, 9] : [9, 7, 6, 5];
    seq.forEach((n, i) => {
      playTone(PENTATONIC_FREQ[n], 1.4, 0.13, i * 0.075);
    });
  }

  function playLetterUnfold() {
    [5, 7, 8, 10].forEach((n, i) => {
      playTone(PENTATONIC_FREQ[n], 2.1, 0.15, i * 0.09);
    });
  }

  function playLighthouseBell() {
    playTone(587.33, 2.6, 0.16, 0.0);
    playTone(880.00, 2.8, 0.13, 0.14);
    playTone(1174.66, 2.4, 0.09, 0.28);
  }

  function playShipBell() {
    playTone(783.99, 1.8, 0.16, 0.0, "triangle");
    playTone(783.99, 2.1, 0.14, 0.24, "triangle");
  }

  function playDuetArpeggio() {
    // Violin + guitar warm romantic chord arpeggio
    const notes = [261.63, 329.63, 392.0, 493.88, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      playTone(f, 2.3, 0.13, i * 0.085, i < 3 ? "triangle" : "sine");
    });
  }

  function playVendingClink() {
    playTone(987.77, 0.45, 0.12, 0.0, "sine");
    playTone(1318.51, 0.65, 0.14, 0.09, "sine");
  }

  function playFishRipple() {
    [6, 8, 9, 10].forEach((n, i) => {
      playTone(PENTATONIC_FREQ[n], 0.85, 0.11, i * 0.055);
    });
  }

  function playPetalGlissando() {
    [4, 5, 6, 7, 8, 9, 10].forEach((n, i) => {
      playTone(PENTATONIC_FREQ[n], 2.0, 0.12, i * 0.065);
    });
  }

  function playTramBell() {
    playTone(1046.50, 0.55, 0.15, 0.0, "triangle");
    playTone(1046.50, 0.75, 0.15, 0.16, "triangle");
  }

  return {
    unlock: ensureUnlocked,
    playRoofChime,
    playLetterUnfold,
    playLighthouseBell,
    playShipBell,
    playDuetArpeggio,
    playVendingClink,
    playFishRipple,
    playPetalGlissando,
    playTramBell,
  };
}
