import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
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
  const failedAsset = target instanceof HTMLScriptElement || target instanceof HTMLLinkElement
  const src = target instanceof HTMLScriptElement ? target.src : target instanceof HTMLLinkElement ? target.href : ''
  if (isRecoverableChunkError(message) || (failedAsset && src.includes('/assets/'))) {
    console.warn('Asset load failed; recovering by clearing caches...', message || src)
    clearCachesAndReload()
  }
}, true)

// Registrasi Service Worker untuk PWA — update otomatis tanpa reload manual.
if ('serviceWorker' in navigator) {
  // Query versi membuat request worker unik per build sehingga CDN/browser
  // tidak dapat mempertahankan sw.js lama pada PWA yang sedang dibuka.
  const SERVICE_WORKER_URL = '/sw.js?build=pwa-v17'
  let refreshing = false
  let hadController = Boolean(navigator.serviceWorker.controller)

  const reloadAfterWorkerUpdate = () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  }

  const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }

  const registerServiceWorker = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL, { updateViaCache: 'none' })
      .then(registration => {
        console.log('SW registered:', registration)

        // Pasang listener sebelum update() agar tidak kehilangan event updatefound.
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          if (!installingWorker) return

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        activateWaitingWorker(registration)

        const checkForUpdate = () => {
          registration.update().catch((error) => {
            console.debug('SW update check skipped:', error)
          })
        }

        // Cek saat launch, saat PWA kembali terlihat, dan berkala ketika tetap terbuka.
        checkForUpdate()
        window.addEventListener('pageshow', checkForUpdate)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })
        window.setInterval(checkForUpdate, 60_000)
      })
      .catch(registrationError => {
        console.log('SW registration failed:', registrationError)
      })
  }

  // Jangan menunggu event load. Di PWA Android ini mempercepat sinkronisasi
  // worker sebelum pengguna sempat mengirim formulir login.
  registerServiceWorker()

  // Saat worker baru mengambil alih tab yang sedang terbuka, refresh otomatis.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    reloadAfterWorkerUpdate()
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
// Pertahankan counter beberapa saat setelah render. Lazy chunk bisa gagal
// setelah shell React tampil; menghapus counter terlalu cepat dapat membuat
// recovery loop tanpa batas pada deploy parsial.
window.setTimeout(() => {
  sessionStorage.removeItem('chunk_reload_attempt')
}, 30_000)
