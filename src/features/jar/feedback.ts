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

// A short glassy "clink" whose loudness follows impact speed.
export function clink(speed: number) {
  const ctx = context()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (now - lastClink < 0.03) return // avoid a wall of noise when many marbles land at once
  lastClink = now

  const volume = Math.min(0.25, 0.04 + speed * 0.025)
  const pitch = 2200 + Math.random() * 1400
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

export function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Vibration is optional.
  }
}
