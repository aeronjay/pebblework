import { useEffect, useRef } from 'react'
import { drawJar } from './draw'
import { prefersDark } from './palette'
import { JarSim, WORLD, type SimMarble } from './sim'

interface Props {
  capacity: number
  marbles: SimMarble[]
  onDrop?: () => void
  onImpact?: (speed: number) => void
}

const DROP_STAGGER_MS = 140

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function JarView({ capacity, marbles, onDrop, onImpact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<JarSim | null>(null)
  const restoredRef = useRef(false)
  const pending = useRef<SimMarble[]>([])
  const callbacks = useRef({ onDrop, onImpact })
  useEffect(() => {
    callbacks.current = { onDrop, onImpact }
  })

  // One simulation per capacity (marble size depends on it).
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const sim = new JarSim(capacity)
    sim.onImpact = (speed) => callbacks.current.onImpact?.(speed)
    simRef.current = sim
    restoredRef.current = false

    let scale = 1
    let raf = 0
    let lastDrop = 0
    let needsDraw = true

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round((w * WORLD.height * dpr) / WORLD.width)
      scale = canvas.width / WORLD.width
      needsDraw = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const frame = (t: number) => {
      if (pending.current.length && t - lastDrop > DROP_STAGGER_MS) {
        sim.drop(pending.current.shift()!)
        callbacks.current.onDrop?.()
        lastDrop = t
      }
      const active = !sim.resting || pending.current.length > 0
      if (active) sim.step()
      if (active || needsDraw) {
        drawJar(ctx, sim.bodies.values(), scale, prefersDark())
        needsDraw = false
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      sim.dispose()
      simRef.current = null
      pending.current = []
    }
  }, [capacity])

  // Reconcile marbles with the simulation: restore on first load, drop new ones, remove undone ones.
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    if (!restoredRef.current) {
      sim.restore(marbles)
      restoredRef.current = true
      return
    }
    const ids = new Set(marbles.map((m) => m.id))
    for (const id of [...sim.bodies.keys()]) if (!ids.has(id)) sim.remove(id)
    pending.current = pending.current.filter((m) => ids.has(m.id))
    const queued = new Set(pending.current.map((m) => m.id))
    const fresh = marbles.filter((m) => !sim.bodies.has(m.id) && !queued.has(m.id))
    if (prefersReducedMotion()) fresh.forEach((m) => sim.place(m))
    else pending.current.push(...fresh)
  }, [marbles, capacity])

  return (
    <canvas
      ref={canvasRef}
      onClick={() => simRef.current?.shake()}
      role="img"
      aria-label={`Jar with ${marbles.length} of ${capacity} marbles`}
      className="block w-full cursor-pointer select-none"
      style={{ aspectRatio: `${WORLD.width} / ${WORLD.height}` }}
    />
  )
}
