import confetti from 'canvas-confetti'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy } from 'lucide-react'
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { db, getSettings } from '../../db/db'
import type { QuestCategory, Settings, Stone } from '../../db/types'
import { onClaim, type ClaimEvent } from '../quests/claimBus'
import { useQuestJar, type QuestJarState } from '../quests/hooks'
import { CATEGORY, CATEGORY_ORDER } from '../quests/meta'
import { buzz, chime, clink } from './feedback'
import { hex, prefersReducedMotion, readTheme, tint, type RGB } from './palette'
import { WORLD, type SimMarble } from './sim'
import { JarStage } from './stage'

const ALMOST_FULL = 0.8
const FLIGHT_MS = 680
const MAX_TOKENS = 12
const LIVE_GRACE_MS = 450 // let a claim event arrive before treating new DB rows as "dropped elsewhere"
const DRAG_REACH = 70 // px: how far the jar follows the pointer before it resists (rubber band)
const TAP_SLOP = 5 // px: less movement than this is a tap, which gives the jar a quick shake

// Follows the pointer 1:1 near the rest spot, then stiffens toward ±DRAG_REACH.
const rubber = (d: number) => Math.sign(d) * DRAG_REACH * (1 - Math.exp(-Math.abs(d) / DRAG_REACH))

interface Shown {
  capacity: number
  stones: Pick<Stone, 'id' | 'category' | 'weight'>[]
  jarsFilled: number
}

interface Token {
  id: string
  from: { x: number; y: number }
  to: { x: number; y: number }
  size: number
  color: string
  delay: number
}

const CHIP: Record<QuestCategory, { chip: string; dot: string; bar: string }> = {
  dq: { chip: 'bg-dq-soft text-dq-ink', dot: 'bg-dq', bar: 'bg-dq' },
  mq: { chip: 'bg-mq-soft text-mq-ink', dot: 'bg-mq', bar: 'bg-mq' },
  sq: { chip: 'bg-sq-soft text-sq-ink', dot: 'bg-sq', bar: 'bg-sq' },
}

const toSim = (s: Pick<Stone, 'id' | 'category' | 'weight' | 'rarity'>): SimMarble => ({
  id: s.id,
  category: s.category,
  weight: s.weight,
  rarity: s.rarity,
})

const fromLive = (l: QuestJarState): Shown => ({ capacity: l.capacity, stones: l.stones, jarsFilled: l.jarsFilled })

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Does the live jar already include the outcome of this claim?
function liveReflects(l: QuestJarState | undefined, e: ClaimEvent): boolean {
  if (!l) return false
  const { stones, filledJarIds } = e.result
  const jarId = l.jar?.id
  if (!jarId || filledJarIds.includes(jarId)) return false
  const last = stones.at(-1)
  if (last && !filledJarIds.includes(last.jarId) && last.jarId !== jarId) return false
  const have = new Set(l.stones.map((s) => s.id))
  return stones.every((s) => s.jarId !== jarId || have.has(s.id))
}

export function QuestJar() {
  const live = useQuestJar()
  const settings = useLiveQuery(() => getSettings())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<JarStage | null>(null)
  const liveRef = useRef(live)
  const settingsRef = useRef<Settings | undefined>(settings)
  const shownRef = useRef<Shown | null>(null)
  const playing = useRef(0) // claim events queued or playing
  const queue = useRef<Promise<void>>(Promise.resolve())
  const timers = useRef(new Set<number>())
  const [shown, setShownState] = useState<Shown | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [celebration, setCelebration] = useState<{ n: number; key: number } | null>(null)
  // Drag the jar around to shake it: the canvas follows the pointer and springs back on release.
  const jarX = useMotionValue(0)
  const jarY = useMotionValue(0)
  const jarTilt = useTransform(jarX, (x) => x * 0.08)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const springs = useRef<AnimationPlaybackControls[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const sync = () => stageRef.current?.setOffset(jarX.get(), jarY.get())
    const offX = jarX.on('change', sync)
    const offY = jarY.on('change', sync)
    return () => {
      offX()
      offY()
      springs.current.forEach((a) => a.stop())
    }
  }, [jarX, jarY])

  const onJarDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || drag.current) return
    springs.current.forEach((a) => a.stop())
    e.currentTarget.setPointerCapture(e.pointerId)
    // Grab from wherever the jar is now (it may still be springing back).
    drag.current = { id: e.pointerId, x: e.clientX - jarX.get(), y: e.clientY - jarY.get(), moved: false }
    setDragging(true)
  }

  const onJarMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return
    d.moved = true
    jarX.set(rubber(dx))
    jarY.set(rubber(dy))
  }

  const onJarUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (!d.moved && e.type === 'pointerup') stageRef.current?.shake()
    // A bouncy return, so letting go gives one last wobble.
    const spring = { type: 'spring', stiffness: 520, damping: 14 } as const
    springs.current = [animate(jarX, 0, spring), animate(jarY, 0, spring)]
  }

  useEffect(() => {
    liveRef.current = live
    settingsRef.current = settings
  })

  const setShown = (s: Shown) => {
    shownRef.current = s
    setShownState(s)
  }

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }

  // Bring the canvas in line with the live query. Without an event to play, new stones still drop in
  // (e.g. a claim in another tab), and a different jar is restored in place.
  const resync = () => {
    const stage = stageRef.current
    const l = liveRef.current
    if (!stage || !l) return
    const jarId = l.jar?.id ?? null
    const ids = new Set(l.stones.map((s) => s.id))
    if (jarId !== stage.jarId || l.capacity !== stage.capacity) {
      const same = jarId === stage.jarId && l.stones.every((s) => stage.sim.bodies.has(s.id))
      if (!same || stage.count === 0) {
        stage.reset(l.capacity)
        stage.restore(l.stones.map(toSim))
      }
    } else {
      for (const id of [...stage.sim.bodies.keys()]) if (!ids.has(id)) stage.remove(id)
      const fresh = l.stones.filter((s) => !stage.sim.bodies.has(s.id))
      if (prefersReducedMotion()) stage.placeAll(fresh.map(toSim))
      else fresh.forEach((s, i) => later(i * 140, () => stage.drop(toSim(s))))
    }
    stage.jarId = jarId
    setShown(fromLive(l))
  }

  // One stage for the component's lifetime, created once the first live snapshot exists.
  const ready = live !== undefined
  useEffect(() => {
    if (!ready) return
    const l = liveRef.current!
    const stage = new JarStage(canvasRef.current!, l.capacity)
    stage.restore(l.stones.map(toSim))
    stage.jarId = l.jar?.id ?? null
    stage.onImpact = (speed, body) => {
      if (settingsRef.current?.sound) clink(speed, body.marble.weight)
    }
    stageRef.current = stage
    setShown(fromLive(l))
    const pending = timers.current
    return () => {
      stage.dispose()
      stageRef.current = null
      for (const id of pending) clearTimeout(id)
      pending.clear()
      playing.current = 0
    }
  }, [ready])

  useEffect(() => {
    if (!live || playing.current || !stageRef.current) return
    const stage = stageRef.current
    const changed = (live.jar?.id ?? null) !== stage.jarId || live.stones.some((s) => !stage.sim.bodies.has(s.id))
    const t = setTimeout(() => {
      if (!playing.current) resync()
    }, changed ? LIVE_GRACE_MS : 0)
    return () => clearTimeout(t)
  }, [live]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly tokens from the claimed calendar days to the mouth, then drop each day's stones as its token lands.
  const deliver = (stage: JarStage, stones: Stone[], origins: ClaimEvent['origins'] | null, onDrop: (s: Stone) => void) =>
    new Promise<void>((resolve) => {
      const s = settingsRef.current
      if (prefersReducedMotion()) {
        stage.placeAll(stones.map(toSim))
        stones.forEach(onDrop)
        if (s?.sound) clink(1.5, 2)
        if (s?.haptics) buzz()
        return resolve()
      }
      const mouth = stage.mouth()
      const byDay = new Map<string, Stone[]>()
      for (const st of stones) byDay.set(st.dayKey, [...(byDay.get(st.dayKey) ?? []), st])
      const days = [...byDay.keys()]
      const dayGap = Math.min(240, 2000 / days.length)
      const stoneGap = Math.max(40, Math.min(130, 2400 / stones.length))
      const flying: Token[] = []
      let end = 0
      days.forEach((key, i) => {
        const group = byDay.get(key)!
        const rect = dayRect(key) ?? origins?.[key]
        const fly = mouth.visible && rect && i < MAX_TOKENS
        const start = i * dayGap
        const land = start + (fly ? FLIGHT_MS : 0)
        const jitter = (Math.random() - 0.5) * 40
        if (fly) {
          const heaviest = group.reduce((a, b) => (b.weight > a.weight ? b : a))
          flying.push({
            id: `${key}:${heaviest.id}`,
            from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            to: { x: mouth.x + jitter, y: mouth.y },
            size: 8 + heaviest.weight * 2,
            color: CATEGORY[heaviest.category].color,
            delay: start,
          })
        }
        group.forEach((st, j) => {
          const at = land + j * stoneGap
          end = Math.max(end, at)
          later(at, () => {
            const x = fly ? mouth.toWorldX(mouth.x + jitter) + (Math.random() - 0.5) * 50 : undefined
            stage.drop(toSim(st), x)
            onDrop(st)
            if (settingsRef.current?.haptics) buzz(6 + st.weight * 4)
          })
        })
      })
      if (flying.length) {
        setTokens((t) => [...t, ...flying])
        later(end + FLIGHT_MS, () => setTokens((t) => t.filter((x) => !flying.includes(x))))
      }
      later(end + 60, resolve)
    })

  const celebrate = async (stage: JarStage, n: number, stones: Shown['stones']) => {
    const reduced = prefersReducedMotion()
    const s = settingsRef.current
    const theme = readTheme(canvasRef.current ?? undefined)
    const totals = CATEGORY_ORDER.map((c) => [c, stones.filter((x) => x.category === c).reduce((a, x) => a + x.weight, 0)] as const)
    const lead = [...totals].sort((a, b) => b[1] - a[1])[0][0]
    const glow: RGB = tint(theme.stones[lead], 0.15)
    if (s?.sound) chime()
    if (s?.haptics) buzz(40)
    setCelebration({ n, key: Date.now() })
    if (!reduced) {
      stage.pulse(glow)
      const colors = [...CATEGORY_ORDER.map((c) => hex(theme.stones[c])), '#f2c14e', '#ffffff']
      const origin = stage.origin()
      const base = { colors, origin, disableForReducedMotion: true, ticks: 240, scalar: 0.85, zIndex: 60 }
      void confetti({ ...base, particleCount: 70, spread: 70, startVelocity: 34, angle: 90 })
      later(180, () => {
        void confetti({ ...base, particleCount: 40, spread: 55, startVelocity: 28, angle: 60 })
        void confetti({ ...base, particleCount: 40, spread: 55, startVelocity: 28, angle: 120 })
      })
    }
    await wait(reduced ? 2600 : 2100)
    setCelebration(null)
    await stage.empty(reduced)
  }

  const play = async (e: ClaimEvent) => {
    const stage = stageRef.current
    if (!stage || !e.result.stones.length) return
    // Contiguous runs of stones by jar, in drop order: sealed jars first, the fresh one last.
    const segments: { jarId: string; stones: Stone[] }[] = []
    for (const st of e.result.stones) {
      const last = segments.at(-1)
      if (last?.jarId === st.jarId) last.stones.push(st)
      else segments.push({ jarId: st.jarId, stones: [st] })
    }
    const jars = await db.jars.bulkGet(segments.map((s) => s.jarId))
    // The jar usually sits below the calendar (and below the fold): bring the whole card into view first so
    // the stones land where the user can see them. Origins were measured before the scroll; deliver() re-reads them.
    const card = canvasRef.current?.closest('section')
    if (card) {
      const r = card.getBoundingClientRect()
      if (r.top < 0 || r.bottom > window.innerHeight) {
        const before = window.scrollY
        card.scrollIntoView({ block: r.height > window.innerHeight ? 'start' : 'end', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        await wait(prefersReducedMotion() ? 50 : 520)
        e = { ...e, origins: shiftOrigins(e.origins, before - window.scrollY) }
      }
    }
    const start = shownRef.current ?? fromLive(liveRef.current!)
    let filled = start.jarsFilled
    let inJar = stage.jarId === segments[0].jarId ? [...start.stones] : []

    for (const [i, seg] of segments.entries()) {
      if (stageRef.current !== stage) return // unmounted
      const capacity = jars[i]?.capacity ?? stage.capacity
      if (seg.jarId !== stage.jarId || (stage.count === 0 && capacity !== stage.capacity)) {
        // A new jar (first claim or after a fill), or an empty jar whose capacity the claim recomputed.
        inJar = []
        stage.reset(capacity)
        stage.jarId = seg.jarId
      }
      setShown({ capacity, stones: inJar, jarsFilled: filled })
      // Overflow stones already flew in with their day's token: they just fall into the fresh jar.
      await deliver(stage, seg.stones, i === 0 ? e.origins : null, (st) => {
        inJar = [...inJar, st]
        setShown({ capacity, stones: inJar, jarsFilled: filled })
      })
      await stage.settled(2200)
      if (e.result.filledJarIds.includes(seg.jarId)) {
        filled += 1
        setShown({ capacity, stones: inJar, jarsFilled: filled })
        await celebrate(stage, filled, inJar)
        inJar = []
        stage.jarId = null
        setShown({ capacity, stones: inJar, jarsFilled: filled })
        await wait(250)
      }
    }
  }

  // Subscribed after `play` is declared, so the handler never reads it before initialization.
  useEffect(
    () =>
      onClaim((e) => {
        playing.current += 1
        queue.current = queue.current
          .then(() => play(e))
          .catch((err) => console.error('Jar animation failed', err))
          .finally(() => {
            playing.current = Math.max(0, playing.current - 1)
            // If the live query hasn't caught up yet, the [live] effect reconciles when it does; resyncing
            // against the pre-claim snapshot would briefly restore the old jar.
            if (playing.current) return
            if (liveReflects(liveRef.current, e)) resync()
            else later(1500, () => !playing.current && resync()) // safety net if no further live update comes
          })
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const s = shown
  const capacity = s?.capacity ?? 1
  // The stone that fills a jar may overshoot by up to 2; a full jar reads as exactly full.
  const weight = Math.min(capacity, s ? s.stones.reduce((n, x) => n + x.weight, 0) : 0)
  const fill = Math.min(1, weight / capacity)
  const toGo = Math.max(0, capacity - weight)
  const byCat = CATEGORY_ORDER.map((c) => ({ c, n: s ? s.stones.filter((x) => x.category === c).reduce((a, x) => a + x.weight, 0) : 0 }))
  const copy = celebration
    ? 'A fresh jar is ready for your next stones'
    : !s
      ? ''
      : weight === 0
        ? "Finish a day's quests, then claim to drop your first stones"
        : toGo === 0
          ? 'Full! Sealing this jar…'
          : fill >= ALMOST_FULL
            ? `Only ${toGo} to go`
            : `${toGo} to go until this jar is full`

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="quest-jar-title" className="flex scroll-mt-6 scroll-mb-24 flex-col md:scroll-mb-6 lg:min-h-0 lg:flex-1">
        <header className="flex items-center justify-between gap-3">
          <h2 id="quest-jar-title" className="text-[14px] font-semibold text-muted">
            Your jar
          </h2>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-chip bg-ink/[0.06] px-2.5 py-1 text-[12.5px] text-muted"
            aria-label={`Jars filled: ${s?.jarsFilled ?? 0}`}
          >
            <Trophy size={13} strokeWidth={1.75} className="text-mq" aria-hidden />
            <motion.span
              key={s?.jarsFilled ?? 0}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              className="font-semibold tabular-nums text-ink"
            >
              {s?.jarsFilled ?? 0}
            </motion.span>
            {(s?.jarsFilled ?? 0) === 1 ? 'jar filled' : 'jars filled'}
          </span>
        </header>

        {/* Big screens: the jar beside its count, in a size container that takes the stage's spare height (fixed when
            the page scrolls). Small screens: stacked, the jar capped to ~half the viewport so today's quests stay close. */}
        <div className="mt-3 flex flex-col items-center gap-5 lg:h-[380px] lg:flex-row lg:items-stretch lg:justify-center lg:gap-8 lg:[container-type:size] tall:h-auto tall:min-h-0 tall:flex-1">
        <div className="flex w-full max-w-[min(300px,calc(46svh*var(--jar-ratio)))] items-center justify-center lg:w-auto lg:max-w-none lg:shrink-0" style={{ ['--jar-ratio' as string]: WORLD.width / WORLD.height }}>
        <div className="relative w-full lg:w-[min(420px,calc(100cqw-196px),calc(100cqh*var(--jar-ratio)))]">
          {/* Soft spotlight so the glass has something to refract. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[-14%] top-[2%] bottom-[-4%] rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--stage-glow), transparent)' }}
          />
          <AnimatePresence>
            {celebration && (
              <motion.div
                key={`glow-${celebration.key}`}
                aria-hidden
                className="pointer-events-none absolute inset-[-6%] rounded-full"
                style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--color-mq) 30%, transparent), transparent 80%)' }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0, 1, 0.6, 1], scale: [0.9, 1.04, 1, 1.02] }}
                exit={{ opacity: 0, transition: { duration: 0.6 } }}
                transition={{ duration: 1.6, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
          <motion.canvas
            ref={canvasRef}
            onPointerDown={onJarDown}
            onPointerMove={onJarMove}
            onPointerUp={onJarUp}
            onPointerCancel={onJarUp}
            role="img"
            aria-label={`Reward jar: ${weight} of ${capacity} filled. Drag to shake it.`}
            title="Drag to shake"
            className={`relative block w-full touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ aspectRatio: `${WORLD.width} / ${WORLD.height}`, x: jarX, y: jarY, rotate: jarTilt }}
          />
          <AnimatePresence>
            {celebration && (
              <motion.div
                key={celebration.key}
                role="status"
                className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.35 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.15 }}
              >
                <div className="rounded-card border border-line bg-elevated/90 px-5 py-3 shadow-pop backdrop-blur-sm">
                  <p className="font-display text-[28px] leading-tight font-normal text-ink">Jar filled!</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted">
                    <Trophy size={14} strokeWidth={1.75} className="text-mq" aria-hidden />
                    <span>
                      Jars filled: <span className="font-semibold tabular-nums text-ink">{celebration.n}</span>
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>

        <div className="w-full lg:flex lg:w-[164px] lg:shrink-0 lg:flex-col lg:justify-end lg:pb-[8%]">
          <p className="flex items-baseline gap-2 text-ink tabular-nums" aria-label={`${weight} of ${capacity}`}>
            <span className="font-display text-[60px] leading-[0.9] tracking-[-0.03em]">{weight}</span>
            <span className="text-[15px] text-muted">of {capacity}</span>
          </p>
          <p className="mt-2 min-h-10 text-[14px] leading-snug text-muted" aria-live="polite">
            {copy || 'Stones from your claimed days'}
          </p>
          <div
            className="mt-3 flex h-1.5 w-full gap-px overflow-hidden rounded-chip bg-ink/[0.08]"
            role="progressbar"
            aria-label="Jar fill"
            aria-valuemin={0}
            aria-valuemax={capacity}
            aria-valuenow={weight}
          >
            {byCat.map(({ c, n }) =>
              n ? (
                <div
                  key={c}
                  className={`${CHIP[c].bar} h-full transition-[width] duration-500 ease-out-soft first:rounded-l-chip last:rounded-r-chip`}
                  style={{ width: `${(Math.min(n, capacity) / capacity) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Stones by category">
            {byCat.map(({ c, n }) => (
              <li key={c} className="inline-flex items-center gap-1.5 text-[13px] text-muted" title={CATEGORY[c].label} aria-label={`${CATEGORY[c].label}: ${n}`}>
                <span className={`size-2 rounded-full ${CHIP[c].dot}`} aria-hidden />
                {CATEGORY[c].label.replace(' Quest', '')}
                <span className="font-semibold text-ink tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        </div>
      </section>

      {tokens.length > 0 &&
        createPortal(
          <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
            {tokens.map((t) => (
              <FlightToken key={t.id} token={t} />
            ))}
          </div>,
          document.body,
        )}
    </MotionConfig>
  )
}

function FlightToken({ token: t }: { token: Token }) {
  const dx = t.to.x - t.from.x
  const peak = Math.min(t.from.y, t.to.y) - 60 - Math.abs(dx) * 0.12
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: 0,
        top: 0,
        width: t.size,
        height: t.size,
        marginLeft: -t.size / 2,
        marginTop: -t.size / 2,
        background: `radial-gradient(circle at 35% 30%, white, ${t.color} 55%)`,
        boxShadow: `0 0 12px 3px color-mix(in oklab, ${t.color} 70%, transparent), 0 0 2px 1px white inset`,
      }}
      initial={{ x: t.from.x, y: t.from.y, scale: 0.4, opacity: 0 }}
      animate={{
        x: [t.from.x, t.from.x + dx * 0.55, t.to.x],
        y: [t.from.y, peak, t.to.y],
        scale: [0.4, 1.15, 0.7],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: FLIGHT_MS / 1000,
        delay: t.delay / 1000,
        ease: [0.45, 0, 0.3, 1],
        times: [0, 0.5, 1],
        opacity: { duration: FLIGHT_MS / 1000, delay: t.delay / 1000, times: [0, 0.15, 0.85, 1] },
      }}
    />
  )
}

// A claimed day's cell as it is on screen now (it may have moved since the claim was clicked).
function dayRect(key: string): DOMRect | undefined {
  return document.querySelector<HTMLElement>(`[data-day="${key}"]`)?.getBoundingClientRect()
}

function shiftOrigins(origins: ClaimEvent['origins'], dy: number): ClaimEvent['origins'] {
  if (!dy) return origins
  const out: ClaimEvent['origins'] = {}
  for (const [k, r] of Object.entries(origins)) out[k] = new DOMRect(r.left, r.top + dy, r.width, r.height)
  return out
}
