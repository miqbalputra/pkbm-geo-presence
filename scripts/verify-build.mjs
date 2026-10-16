import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distPath = fileURLToPath(new URL('../dist/', import.meta.url))

if (!existsSync(join(distPath, 'index.html'))) {
  throw new Error('dist/index.html tidak ditemukan. Jalankan npm run build terlebih dahulu.')
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(target) : [target]
  })
}

const files = filesIn(distPath)
const bundle = files.filter((file) => /\.(js|css|html)$/.test(file)).map((file) => readFileSync(file, 'utf8')).join('\n')
const forbidden = [
  /JWT_SECRET\s*[:=]\s*[^\s'"`]{8,}/,
  /DB_PASS\s*[:=]\s*[^\s'"`]{4,}/,
  /TURNSTILE_SECRET_KEY\s*[:=]\s*[^\s'"`]{8,}/,
  /N8N_API_KEY\s*[:=]\s*[^\s'"`]{8,}/,
  /HERMES_API_KEY\s*[:=]\s*[^\s'"`]{8,}/,
  /BEGIN PRIVATE KEY/,
]
const leaked = forbidden.filter((pattern) => pattern.test(bundle)).map((pattern) => pattern.toString())

if (leaked.length > 0) throw new Error(`Secret/config privat terdeteksi di bundle: ${leaked.join(', ')}`)
console.log(`Build security check passed: ${files.length} files, no private secrets found.`)
