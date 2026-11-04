import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { getSettings } from '../../../db/db'
import { ui } from '../../../ui/styles'
import { chime } from '../../jar/feedback'
import { useNow } from '../hooks'
import { formatClock } from '../model'
import { Ring, Stage } from './Stage'

// A real break restores attention; scrolling a feed mostly doesn't. One suggestion per break.
const IDEAS = [
  'Stand up and stretch. Look at something far away.',
  'Get a glass of water. Leave the phone where it is.',
  'Step outside, or to a window, for a minute of daylight.',
  'Close your eyes and take ten slow breaths.',
  'Walk around the room. Let your mind wander on purpose.',
]

export function BreakView({ minutes, onDone }: { minutes: number; onDone: () => void }) {
  const [startedAt] = useState(() => Date.now())
  const [idea] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)])
  const now = useNow(true)
  const settings = useLiveQuery(() => getSettings())
  const total = minutes * 60_000
  const left = Math.max(0, total - (now.getTime() - startedAt))
  const over = left === 0

  const chimed = useRef(false)
  useEffect(() => {
    if (!over || chimed.current) return
    chimed.current = true
    if (settings?.sound ?? true) chime()
  }, [over, settings?.sound])

  useEffect(() => {
    const prev = document.title
    document.title = over ? 'Break’s over' : `Break · ${formatClock(left)}`
    return () => {
      document.title = prev
    }
  }, [over, left])

  return (
    <Stage label="Break">
      <div className="text-center">
        <p className="text-[14px] font-medium text-muted">Break</p>
        <h1 className="mt-1.5 font-display text-[28px] leading-[1.12] font-normal tracking-[-0.02em] md:text-[34px]">
          {over ? 'Break’s over' : 'Step away from the screen'}
        </h1>
      </div>
      <div className="mt-8">
        <Ring progress={1 - left / total}>
          <span className="text-[14px] font-medium text-muted">{over ? 'Done' : 'Left'}</span>
          <span role="timer" className="mt-1 text-[clamp(54px,17vw,80px)] leading-none font-semibold tracking-[-0.045em] text-ink tabular-nums">
            {formatClock(left)}
          </span>
        </Ring>
      </div>
      <p className="mt-8 max-w-[38ch] text-center text-[15px] text-muted">{over ? 'Ready when you are. Or call it a day: that counts too.' : idea}</p>
      <button type="button" onClick={onDone} className={`mt-6 ${over ? `${ui.cta} px-5 py-3 text-[15px]` : `${ui.btn} ${ui.secondary}`}`}>
        {over ? 'Back to Focus' : 'End the break early'}
      </button>
    </Stage>
  )
}
