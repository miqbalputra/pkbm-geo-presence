import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => readFileSync(`${root}/${file}`, 'utf8')

const serviceWorker = read('public/sw.js')
const bootstrap = read('src/main-bootstrap.tsx')
const backend = read('backend/cmd/server/main.go')

const requirements = [
  ['versioned service-worker cache', /CACHE_NAME\s*=\s*['"]presensi-pkbm-v\d+['"]/],
  ['cache-busted service-worker registration', /\/sw\.js\?build=pwa-v\d+/],
  ['fresh navigation fetch', /fetch\(event\.request,\s*\{\s*cache:\s*['"]no-store['"]/],
  ['waiting worker activation message', /type:\s*['"]SKIP_WAITING['"]/],
  ['automatic update check', /registration\.update\(\)/],
  ['reload after controller change', /controllerchange/],
  ['no-cache PWA shell headers', /no-store, no-cache, must-revalidate, proxy-revalidate/],
]

const source = `${serviceWorker}\n${bootstrap}\n${backend}`
for (const [label, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`PWA requirement missing: ${label}`)
}

console.log('PWA update check passed: versioned cache, fresh shell fetch, automatic worker activation, and no-cache deployment headers are present.')
