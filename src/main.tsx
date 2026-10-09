import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './auth/AuthContext'
import App from './App'

if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  const { installMockGoogle } = await import('./dev/mockGoogle')
  installMockGoogle()
}

// Installable app + offline shell (production only; dev uses Vite's live server).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
