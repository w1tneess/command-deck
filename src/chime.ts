let ctx: AudioContext | null = null;

/** Browsers only allow sound after a tap, so this runs on the first tap anywhere in the app. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* no audio available: the timer still works, silently */
  }
}

/** A soft two-note chime plus a short buzz on phones that support it. */
export function chime() {
  try {
    if (ctx) {
      const t0 = ctx.currentTime;
      for (const [freq, delay] of [[659.25, 0], [880, 0.22]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + delay);
        gain.gain.linearRampToValueAtTime(0.18, t0 + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + 1);
      }
    }
  } catch {
    /* ignore */
  }
  navigator.vibrate?.([200, 100, 200]);
}
