/**
 * Procedural Web Audio Ambient Sound Generator.
 * Zero external audio assets, 100% offline-ready, synthesized in real-time.
 * Generates Binaural Beats (Alpha/Beta focus), Soothing Rain, White/Pink Noise, and Calm Café Hum.
 */

let audioCtx: AudioContext | null = null;
let activeSourceNode: AudioNode | null = null;
let activeGainNode: GainNode | null = null;
let currentSound: "none" | "binaural" | "rain" | "whitenoise" | "cafe" = "none";
let currentVolume = 0.5;

function getContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

/** Stop any currently running ambient track cleanly with a quick fade out */
export function stopAmbientSound(): void {
  if (activeGainNode && audioCtx) {
    // Take the nodes now: a new sound may be assigned to the module variables before the timeout fires.
    const oldSource = activeSourceNode;
    const oldGain = activeGainNode;
    activeSourceNode = null;
    activeGainNode = null;
    try {
      const now = audioCtx.currentTime;
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      setTimeout(() => {
        try {
          if (oldSource) {
            (oldSource as AudioBufferSourceNode).stop?.();
            oldSource.disconnect();
          }
          oldGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
      }, 160);
    } catch {
      /* ignore */
    }
  }
  currentSound = "none";
}

/** Set master ambient sound volume (0.0 to 1.0) */
export function setAmbientVolume(val: number): void {
  currentVolume = Math.max(0, Math.min(1, val));
  if (activeGainNode && audioCtx) {
    try {
      activeGainNode.gain.setValueAtTime(currentVolume * 0.35, audioCtx.currentTime);
    } catch {
      /* ignore */
    }
  }
}

export function getAmbientVolume(): number {
  return currentVolume;
}

export function getCurrentAmbient(): "none" | "binaural" | "rain" | "whitenoise" | "cafe" {
  return currentSound;
}

/** Synthesize Binaural Beats (216 Hz carrier with a 14 Hz Beta wave beat in stereo) */
function createBinauralBeats(ctx: AudioContext, gain: GainNode) {
  // Carrier 216Hz on Left, 230Hz on Right -> 14Hz Beta Wave for deep study concentration
  const oscL = ctx.createOscillator();
  const oscR = ctx.createOscillator();
  oscL.type = "sine";
  oscR.type = "sine";
  oscL.frequency.value = 216;
  oscR.frequency.value = 230;

  const merger = ctx.createChannelMerger(2);
  oscL.connect(merger, 0, 0); // left
  oscR.connect(merger, 0, 1); // right

  // Add subtle pink noise underlay to soften the pure tone
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    data[i] = (b0 + b1 + b2) * 0.04;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 500;

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(gain);
  merger.connect(gain);

  oscL.start();
  oscR.start();
  noiseSource.start();

  return {
    disconnect() {
      try { oscL.stop(); oscR.stop(); noiseSource.stop(); } catch { /* ignore */ }
      oscL.disconnect(); oscR.disconnect(); merger.disconnect();
      noiseSource.disconnect(); noiseFilter.disconnect();
    },
  };
}

/** Synthesize Soothing Rain using filtered pink noise and gentle dynamic sweep */
function createRain(ctx: AudioContext, gain: GainNode) {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brownian-like smoothing for heavy drops
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Filter 1: Highpass to eliminate muddy low rumble
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 400;

  // Filter 2: Bandpass to capture rainfall patter
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 0.8;

  // Filter 3: Gentle lowpass for softer shower
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3500;

  source.connect(hp);
  hp.connect(bp);
  bp.connect(lp);
  lp.connect(gain);

  source.start();

  return {
    disconnect() {
      try { source.stop(); } catch { /* ignore */ }
      source.disconnect(); hp.disconnect(); bp.disconnect(); lp.disconnect();
    },
  };
}

/** Synthesize Smooth White / Pink Noise */
function createWhiteNoise(ctx: AudioContext, gain: GainNode) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    data[i] = (b0 + b1 + b2) * 0.12;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;

  source.connect(lp);
  lp.connect(gain);
  source.start();

  return {
    disconnect() {
      try { source.stop(); } catch { /* ignore */ }
      source.disconnect(); lp.disconnect();
    },
  };
}

/** Synthesize Calm Café Hum (subtle room acoustics and warm multi-filter resonance) */
function createCafe(ctx: AudioContext, gain: GainNode) {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 650;
  lowpass.Q.value = 2.0;

  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 320;
  peak.gain.value = 4.0;
  peak.Q.value = 3.0;

  source.connect(lowpass);
  lowpass.connect(peak);
  peak.connect(gain);
  source.start();

  return {
    disconnect() {
      try { source.stop(); } catch { /* ignore */ }
      source.disconnect(); lowpass.disconnect(); peak.disconnect();
    },
  };
}

/** Play chosen ambient sound */
export function playAmbientSound(type: "binaural" | "rain" | "whitenoise" | "cafe"): void {
  stopAmbientSound();

  try {
    const ctx = getContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(currentVolume * 0.35, ctx.currentTime + 0.5);
    gain.connect(ctx.destination);
    activeGainNode = gain;

    let controller: { disconnect: () => void };
    if (type === "binaural") {
      controller = createBinauralBeats(ctx, gain);
    } else if (type === "rain") {
      controller = createRain(ctx, gain);
    } else if (type === "whitenoise") {
      controller = createWhiteNoise(ctx, gain);
    } else {
      controller = createCafe(ctx, gain);
    }

    activeSourceNode = controller as unknown as AudioNode;
    currentSound = type;
  } catch (err) {
    console.error("Ambient audio synthesis error:", err);
    currentSound = "none";
  }
}
