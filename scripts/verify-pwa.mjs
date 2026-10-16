import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => readFileSync(`${root}/${file}`, 'utf8')

const serviceWorker = read('public/sw.js')
const bootstrap = read('src/main-bootstrap.tsx')
const backend = read('backend/cmd/server/main.go')
const app = read('src/App.tsx')
const manifest = JSON.parse(read('public/manifest.json'))

const requirements = [
  ['versioned service-worker cache', /CACHE_NAME\s*=\s*['"]presensi-pkbm-v\d+['"]/],
  ['cache-busted service-worker registration', /\/sw\.js\?build=pwa-v\d+/],
  ['fresh navigation fetch', /fetch\(event\.request,\s*\{\s*cache:\s*['"]no-store['"]/],
  ['waiting worker activation message', /type:\s*['"]SKIP_WAITING['"]/],
  ['automatic update check', /registration\.update\(\)/],
  ['reload after controller change', /controllerchange/],
  ['no-cache PWA shell headers', /no-store, no-cache, must-revalidate, proxy-revalidate/],
  ['browser install prompt capture', /addEventListener\('beforeinstallprompt',\s*handleBeforeInstallPrompt\)/],
  ['browser install action', /deferredPrompt\.prompt\(\)/],
  ['installed-app state handling', /addEventListener\('appinstalled',\s*handleAppInstalled\)/],
  ['install notice shown outside account/settings pages', /showInstallPrompt\s*&&\s*!appInstalled/],
  ['manual installation instructions for unsupported browsers', /Tambahkan ke Layar Utama/],
]

const source = `${serviceWorker}\n${bootstrap}\n${backend}\n${app}`
for (const [label, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`PWA requirement missing: ${label}`)
}

if (!manifest.name && !manifest.short_name) throw new Error('PWA manifest must define name or short_name')
if (!manifest.start_url || !['standalone', 'minimal-ui', 'fullscreen'].includes(manifest.display)) {
  throw new Error('PWA manifest must define start_url and an installable display mode')
}
for (const size of ['192x192', '512x512']) {
  const icon = manifest.icons?.find((item) => item.sizes?.split(/\s+/).includes(size))
  if (!icon || !existsSync(join(root, 'public', icon.src.replace(/^\/+/, '')))) {
    throw new Error(`PWA manifest is missing its ${size} icon`)
  }
}

console.log('PWA verification passed: manifest/install icons, install prompt and fallback instructions, service-worker updates, and no-cache deployment headers are present.')
