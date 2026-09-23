// Geluidseffecten, zelf opgebouwd met Web Audio (geen audiobestanden nodig).
// iOS laat pas geluid toe na een tik op het scherm; daarom wordt de AudioContext bij elke tik "wakker" gemaakt.
// De stille-modusschakelaar van de iPhone dempt dit ook.

const KEY = 'boevenjacht-sound'
let ctx: AudioContext | null = null
let on = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
})()

export const soundOn = () => on

export function setSound(value: boolean) {
  on = value
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off')
  } catch {
    // geen opslag: geldt alleen voor deze sessie
  }
}

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void audio(), { capture: true, passive: true })
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.to) osc.frequency.linearRampToValueAtTime(opts.to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

const sounds = {
  /** Duitse "tatütata": twee tonen om en om */
  siren() {
    for (let i = 0; i < 4; i++) {
      tone(466, i * 0.7, 0.34, { type: 'square', gain: 0.07 })
      tone(622, i * 0.7 + 0.35, 0.34, { type: 'square', gain: 0.07 })
    }
  },
  /** Glazen die tegen elkaar tikken: Prost! */
  clink() {
    for (const [at, f] of [
      [0, 2637],
      [0.12, 3136],
    ]) {
      tone(f, at, 0.5, { gain: 0.15 })
      tone(f * 2.76, at, 0.25, { gain: 0.05 })
    }
  },
  /** Drie oplopende tonen */
  chime() {
    ;[523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.4, { type: 'triangle', gain: 0.18 }))
  },
  /** Sonar-ping */
  ping() {
    tone(1318, 0, 1.2, { gain: 0.2 })
    tone(1318, 0.6, 0.8, { gain: 0.06 })
  },
  /** Kort alarm (vangst) */
  alarm() {
    for (let i = 0; i < 6; i++) tone(880, i * 0.25, 0.2, { type: 'sawtooth', gain: 0.08, to: 1320 })
  },
  /** Fanfare (boeven ontsnapt) */
  fanfare() {
    ;[392, 523, 659, 784, 659, 784].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.8 : 0.18, { type: 'triangle', gain: 0.18 }))
  },
  /** Tik in de laatste seconden */
  tick() {
    tone(1000, 0, 0.08, { type: 'square', gain: 0.05 })
  },
}

export type SoundName = keyof typeof sounds

export function play(name: SoundName) {
  if (on) sounds[name]()
}
