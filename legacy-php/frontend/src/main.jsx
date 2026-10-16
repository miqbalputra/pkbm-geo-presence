import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Helper: bersihkan cache lama dan reload halaman (recovery dari chunk error)
// Dibatasi maksimal 3x reload untuk mencegah loop tak terhingga saat aset
// benar-benar tidak tersedia di server (mis. deploy parsial).
const CHUNK_RELOAD_KEY = 'chunk_reload_attempt'
const MAX_CHUNK_RETRIES = 3
async function clearCachesAndReload() {
  const attempt = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0', 10)
  if (attempt >= MAX_CHUNK_RETRIES) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    console.warn('Recovery: batas reload tercapai, aset mungkin belum tersedia di server.')
    alert('Gagal memuat aplikasi setelah redeploy. Silakan clear cache browser / coba lagi beberapa saat, atau hubungi admin.')
    return
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(attempt + 1))
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      console.log('Recovered: old caches cleared')
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
      console.log('Recovered: service workers unregistered')
    }
  } catch (err) {
    console.error('Recovery cleanup failed:', err)
  }
  window.location.reload()
}

// Tangkap error dynamic import module — umumnya disebabkan service worker lama
// yang menyimpan chunk rusak atau chunk 404, lalu recovery dengan clear cache.
function isRecoverableChunkError(message = '') {
  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'Unable to preload CSS',
    'Asset not available',
    'ChunkLoadError',
  ].some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()))
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason?.message || String(reason)
  if (isRecoverableChunkError(message)) {
    console.warn('Dynamic import/preload failed; recovering by clearing caches...', message)
    event.preventDefault()
    clearCachesAndReload()
  }
})

window.addEventListener('error', (event) => {
  const message = event.message || event.error?.message || ''
  const target = event.target
  const failedAsset = target?.tagName === 'SCRIPT' || target?.tagName === 'LINK'
  const src = target?.src || target?.href || ''
  if (isRecoverableChunkError(message) || (failedAsset && src.includes('/assets/'))) {
    console.warn('Asset load failed; recovering by clearing caches...', message || src)
    clearCachesAndReload()
  }
}, true)

// Registrasi Service Worker untuk PWA — lebih agresif agar update cepat
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => {
        console.log('SW registered:', registration)

        // Cek update saat halaman load dan setiap 60 detik
        registration.update()
        setInterval(() => {
          console.log('SW: checking for update...')
          registration.update()
        }, 60_000)

        // Saat update ditemukan, tunggu sampai installed lalu reload
        registration.onupdatefound = () => {
          const installingWorker = registration.installing
          if (!installingWorker) return
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('SW: new version installed, reloading...')
              window.location.reload()
            }
          }
        }
      })
      .catch(registrationError => {
        console.log('SW registration failed:', registrationError)
      })
  })

  // Jaga-jaga: reload sekali saat controller berganti
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      window.location.reload()
      refreshing = true
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Hapus loading fallback setelah React render
const loadingEl = document.getElementById('app-loading')
if (loadingEl) loadingEl.remove()
// Aplikasi berhasil render → reset counter recovery chunk error
sessionStorage.removeItem('chunk_reload_attempt')
