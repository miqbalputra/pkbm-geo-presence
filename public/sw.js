const CACHE_NAME = 'presensi-pkbm-v2';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Cache hanya aset statis kecil. HTML shell tidak di-precache agar PWA tidak
// dapat membuka bundle lama setelah aplikasi dideploy ulang.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Allow the page to activate a waiting worker immediately when a browser
// does not honor skipWaiting during an existing PWA session.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // API and mutating requests must always reach the backend. Calling
  // caches.match() with a POST request can throw in the service worker and
  // surface as a generic "Failed to fetch" in the login form.
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Navigasi halaman: network-first, update cache jika berhasil
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
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

  // Shell PWA harus selalu mengambil versi terbaru. Ini mencegah browser
  // HTTP cache mengembalikan index.html lama saat aplikasi dibuka dari ikon.
  if (url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
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
