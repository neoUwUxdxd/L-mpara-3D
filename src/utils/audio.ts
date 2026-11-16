/**
 * Sonido de interruptor basculante sintetizado con Web Audio API (sin archivos externos).
 * Se compone de: transitorio de ruido filtrado (contacto metálico), golpe grave del
 * balancín (oscilador con caída de tono) y un pequeño rebote mecánico.
 */
let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function getNoise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const len = Math.floor(ac.sampleRate * 0.06);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

function tick(ac: AudioContext, out: AudioNode, when: number, freq: number, gain: number, decay: number) {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 2.2;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  src.connect(bp).connect(hp).connect(g).connect(out);
  src.start(when);
  src.stop(when + decay + 0.02);
}

function thump(ac: AudioContext, out: AudioNode, when: number, f0: number, gain: number) {
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f0, when);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.35, when + 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.09);
}

/** Reproduce el clic del interruptor. `on` cambia ligeramente el timbre. */
export function playSwitchClick(on: boolean): void {
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  const master = ac.createGain();
  master.gain.value = 0.55;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);

  const pitch = on ? 1 : 0.86;
  tick(ac, master, t, 3400 * pitch, 0.9, 0.025);
  thump(ac, master, t, 210 * pitch, 0.5);
  // Rebote del balancín al asentarse.
  tick(ac, master, t + 0.018, 5200 * pitch, 0.22, 0.012);
  tick(ac, master, t + 0.031, 2600 * pitch, 0.1, 0.01);
}
