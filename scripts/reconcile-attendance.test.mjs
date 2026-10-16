import assert from 'node:assert/strict'
import test from 'node:test'

import { compareSnapshots } from './reconcile-attendance.mjs'

test('reconciliation accepts equivalent PHP and Go field aliases', () => {
  const result = compareSnapshots(
    [{ id_guru: 'G-01', tanggal: '2026-08-07', status: 'HADIR', jam_masuk: '07:20:00', jam_pulang: '15:00:00', latitude: '-6.2', longitude: '106.8', metode: 'button' }],
    [{ user_id: 'G-01', tanggal: '2026-08-07', status: 'hadir', jamMasuk: '07:20', jamPulang: '15:00', latitude: -6.2, longitude: 106.8, method: 'BUTTON' }],
  )
  assert.equal(result.ok, true)
})

test('reconciliation reports missing and mismatched records', () => {
  const result = compareSnapshots(
    [{ user_id: 1, tanggal: '2026-08-07', status: 'hadir' }, { user_id: 2, tanggal: '2026-08-07', status: 'izin' }],
    [{ user_id: 1, tanggal: '2026-08-07', status: 'sakit' }, { user_id: 3, tanggal: '2026-08-07', status: 'hadir' }],
  )
  assert.equal(result.ok, false)
  assert.deepEqual(result.missingInGo, ['2|2026-08-07'])
  assert.deepEqual(result.extraInGo, ['3|2026-08-07'])
  assert.equal(result.mismatches[0].differences.status.legacy, 'hadir')
})

test('reconciliation rejects duplicate attendance identities', () => {
  const result = compareSnapshots(
    [{ user_id: 1, tanggal: '2026-08-07', status: 'hadir' }, { user_id: 1, tanggal: '2026-08-07', status: 'hadir' }],
    [{ user_id: 1, tanggal: '2026-08-07', status: 'hadir' }],
  )
  assert.equal(result.ok, false)
  assert.deepEqual(result.duplicateLegacy, ['1|2026-08-07'])
})
