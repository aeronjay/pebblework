export function Marble({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full shadow-sm"
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, #fff9, ${color} 45%, color-mix(in oklch, ${color}, black 25%))` }}
    />
  )
}
