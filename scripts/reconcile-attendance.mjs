import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const field = (row, ...names) => {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null) return row[name]
  }
  return ''
}

const text = (value) => String(value ?? '').trim()

const normalizeTime = (value) => {
  const result = text(value)
  if (!result || result === '-' || result === '00:00:00' || result === '00:00') return ''
  return result.length >= 5 ? result.slice(0, 5) : result
}

const normalizeNumber = (value) => {
  const result = text(value)
  if (!result) return ''
  const parsed = Number(result)
  return Number.isFinite(parsed) ? parsed.toFixed(6) : result
}

export function normalizeAttendanceRow(row) {
  const userId = text(field(row, 'user_id', 'userId', 'id_guru', 'idGuru'))
  const nama = text(field(row, 'nama', 'name'))
  const tanggal = text(field(row, 'tanggal', 'date'))
  const identity = userId || nama

  return {
    key: `${identity}|${tanggal}`,
    userId,
    nama,
    tanggal,
    status: text(field(row, 'status')).toLowerCase(),
    jamMasuk: normalizeTime(field(row, 'jam_masuk', 'jamMasuk', 'jam_hadir', 'jamHadir')),
    jamPulang: normalizeTime(field(row, 'jam_pulang', 'jamPulang')),
    jamIzin: normalizeTime(field(row, 'jam_izin', 'jamIzin')),
    jamSakit: normalizeTime(field(row, 'jam_sakit', 'jamSakit')),
    keterangan: text(field(row, 'keterangan', 'description')),
    latitude: normalizeNumber(field(row, 'latitude', 'lat')),
    longitude: normalizeNumber(field(row, 'longitude', 'lon', 'lng')),
    metode: text(field(row, 'metode', 'method')).toLowerCase(),
  }
}

export function extractRows(snapshot) {
  if (Array.isArray(snapshot)) return snapshot
  if (Array.isArray(snapshot?.data)) return snapshot.data
  if (Array.isArray(snapshot?.rows)) return snapshot.rows
  if (Array.isArray(snapshot?.attendance)) return snapshot.attendance
  throw new Error('Snapshot harus berupa array atau object dengan field data/rows/attendance')
}

function indexRows(rows, source) {
  const index = new Map()
  const duplicates = []
  for (const raw of rows) {
    const row = normalizeAttendanceRow(raw)
    if (!row.userId && !row.nama) throw new Error(`${source}: ada row tanpa user_id/id_guru/nama`)
    if (!row.tanggal) throw new Error(`${source}: ada row tanpa tanggal`)
    if (index.has(row.key)) duplicates.push(row.key)
    index.set(row.key, row)
  }
  return { index, duplicates }
}

const comparableFields = [
  'userId', 'tanggal', 'status', 'jamMasuk', 'jamPulang', 'jamIzin', 'jamSakit',
  'keterangan', 'latitude', 'longitude', 'metode',
]

export function compareSnapshots(legacySnapshot, goSnapshot) {
  const legacy = indexRows(extractRows(legacySnapshot), 'legacy')
  const go = indexRows(extractRows(goSnapshot), 'go')
  const missingInGo = []
  const extraInGo = []
  const mismatches = []

  for (const [key, legacyRow] of legacy.index) {
    const goRow = go.index.get(key)
    if (!goRow) {
      missingInGo.push(key)
      continue
    }
    const differences = {}
    for (const name of comparableFields) {
      if (legacyRow[name] !== goRow[name]) differences[name] = { legacy: legacyRow[name], go: goRow[name] }
    }
    if (Object.keys(differences).length > 0) mismatches.push({ key, differences })
  }

  for (const key of go.index.keys()) {
    if (!legacy.index.has(key)) extraInGo.push(key)
  }

  return {
    ok: missingInGo.length === 0 && extraInGo.length === 0 && mismatches.length === 0 &&
      legacy.duplicates.length === 0 && go.duplicates.length === 0,
    legacyCount: legacy.index.size,
    goCount: go.index.size,
    missingInGo,
    extraInGo,
    mismatches,
    duplicateLegacy: legacy.duplicates,
    duplicateGo: go.duplicates,
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const legacyPath = argument('--legacy')
  const goPath = argument('--go')
  if (!legacyPath || !goPath) {
    console.error('Usage: node scripts/reconcile-attendance.mjs --legacy legacy.json --go go.json')
    process.exitCode = 2
  } else {
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'))
    const go = JSON.parse(readFileSync(goPath, 'utf8'))
    const result = compareSnapshots(legacy, go)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
  }
}
