import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import { primeAudio } from './features/jar/feedback'

void requestPersistentStorage()
document.addEventListener('pointerdown', primeAudio, { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
