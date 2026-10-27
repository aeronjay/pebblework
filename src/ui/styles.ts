export const ui = {
  input:
    'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900',
  label: 'mb-1 block text-sm font-medium text-stone-600 dark:text-stone-300',
  hint: 'mt-1 text-xs text-stone-400',
  btn: 'rounded-xl px-4 py-2 font-medium transition active:scale-[.98] disabled:opacity-40',
  primary: 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900',
  secondary: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-100',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  card: 'rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900',
  h1: 'text-2xl font-bold',
}

export function seg(active: boolean) {
  return `flex-1 rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-white font-semibold shadow-sm dark:bg-stone-700' : 'text-stone-500'}`
}
export const segGroup = 'flex gap-1 rounded-xl bg-stone-200 p-1 dark:bg-stone-800'
