// Marble sounds are synthesized with Web Audio, so no audio files ship with the app.
let audio: AudioContext | undefined
let lastClink = 0

function context(): AudioContext | undefined {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return undefined
  }
}

// Unlock audio on the first user gesture; browsers block sound before that.
export function primeAudio() {
  context()
}

// A short glassy "clink" whose loudness follows impact speed. `weight` (1–3) lowers the pitch: heavier stones knock deeper.
export function clink(speed: number, weight = 1) {
  const ctx = context()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (now - lastClink < 0.03) return // avoid a wall of noise when many marbles land at once
  lastClink = now

  const volume = Math.min(0.25, 0.04 + speed * 0.025)
  const pitch = (2200 + Math.random() * 1400) / (1 + (Math.max(1, weight) - 1) * 0.45)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
  gain.connect(ctx.destination)

  for (const ratio of [1, 2.76]) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch * ratio, now)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.2)
  }
}

// A soft celebratory chord: a rising arpeggio of bell-like tones with a gentle shimmer on top.
export function chime() {
  const ctx = context()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.18
  master.connect(ctx.destination)

  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5] // C5 E5 G5 C6 E6
  notes.forEach((freq, i) => {
    const t = now + i * 0.085
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.5 / (1 + i * 0.25), t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    gain.connect(master)
    // Bell partials: fundamental, a soft octave, and an inharmonic glint.
    for (const [ratio, level] of [[1, 1], [2, 0.3], [3.01, 0.12]] as const) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq * ratio, t)
      g.gain.value = level
      osc.connect(g)
      g.connect(gain)
      osc.start(t)
      osc.stop(t + 1.9)
    }
  })
}

export function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Vibration is optional.
  }
}
