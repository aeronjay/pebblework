import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/familjen-grotesk'
import '@fontsource/young-serif'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import { primeAudio } from './features/jar/feedback'

async function boot() {
  // Dev-only fixtures: /?seed=1 or /?seed=full (see src/dev/seed.ts). Tree-shaken from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('seed')) {
    const { seedFromUrl } = await import('./dev/seed')
    if (await seedFromUrl()) return // reloads without the param
  }

  void requestPersistentStorage()
  document.addEventListener('pointerdown', primeAudio, { once: true })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
