import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url))

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(target) : [target]
  })
}

if (!existsSync(root)) throw new Error('src directory not found')

const files = filesIn(root)
const legacyExtensions = files.filter((file) => /\.(jsx?|mjsx?)$/.test(file))
if (legacyExtensions.length > 0) {
  throw new Error(`JavaScript source files are not allowed: ${legacyExtensions.join(', ')}`)
}

const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
if (tsconfig.compilerOptions?.allowJs === true) {
  throw new Error('tsconfig allowJs must remain false')
}

const apiClientPath = join(root, 'services', 'api.ts')
const apiClient = readFileSync(apiClientPath, 'utf8')
if (/\.php(?:\?|['"`])/.test(apiClient)) {
  throw new Error('Frontend API client must use REST v1 paths; PHP compatibility paths are legacy-only')
}
const phpReferences = files.filter((file) => /\.tsx?$/.test(file) && /\.php/.test(readFileSync(file, 'utf8')))
if (phpReferences.length > 0) {
  throw new Error(`Frontend source contains legacy PHP endpoint references: ${phpReferences.join(', ')}`)
}
for (const endpoint of ['/v1/users', '/v1/attendance', '/v1/settings', '/v1/reports/charts', '/v1/qr/scan', '/v1/admin/backups']) {
  if (!apiClient.includes(endpoint)) throw new Error(`REST endpoint missing from frontend API client: ${endpoint}`)
}

const nocheckFiles = files.filter((file) => /\.(tsx?|mts|cts)$/.test(file) && readFileSync(file, 'utf8').includes('@ts-nocheck'))
console.log(`Source stack check passed: ${files.length} TypeScript files, ${nocheckFiles.length} temporary @ts-nocheck markers.`)
