const CACHE_NAME = 'geo-presensi-v16';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon_pwa.png'
];

// Install: Cache aset dasar dan paksa aktif segera
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: Bersihkan SEMUA cache lama (agresif) dan ambil alih semua tab
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Hapus SEMUA cache yang bukan versi sekarang
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Cleaning old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: cek apakah response punya MIME type yang benar
function isValidAssetResponse(response, request) {
  if (!response || !response.ok) return false;
  const ct = response.headers.get('content-type') || '';
  // Tolak response text/html untuk request JS/CSS (SPA fallback yang salah)
  if (ct.includes('text/html')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jangan pernah intercept request ke sw.js sendiri
  if (url.pathname === '/sw.js') {
    return;
  }

  // Navigasi halaman: network-first, update cache jika berhasil
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // JS/CSS chunk: network-first, VALIDASI MIME type sebelum cache
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Hanya cache jika MIME type benar (bukan text/html fallback)
          if (isValidAssetResponse(response, event.request)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fallback ke cache — tapi hanya jika MIME-nya benar
          return caches.match(event.request).then((cached) => {
            if (cached && isValidAssetResponse(cached, event.request)) {
              return cached;
            }
            // Tidak ada cache valid, return error supaya self-healing trigger
            return new Response('Asset not available', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        })
    );
    return;
  }

  // Cross-origin requests (mis. script Google Identity Services):
  // JANGAN di-intercept / cache oleh SW — biarkan browser menanganinya langsung.
  // Meng-intercept request cross-origin dapat menyebabkan script eksternal
  // (seperti accounts.google.com/gsi/client) gagal load di PWA / mobile.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Aset statis lainnya (same-origin): cache first
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});