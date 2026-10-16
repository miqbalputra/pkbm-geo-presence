const baseUrl = (process.env.LOAD_URL || 'http://localhost:8080').replace(/\/$/, '')
const path = process.env.LOAD_PATH || '/health/ready'
const concurrency = boundedInt('LOAD_CONCURRENCY', 20, 1, 200)
const durationSeconds = boundedInt('LOAD_DURATION_SECONDS', 15, 1, 300)
const expectedStatus = boundedInt('LOAD_EXPECTED_STATUS', 200, 100, 599)
const maxErrorRate = boundedFloat('LOAD_MAX_ERROR_RATE', 0.01, 0, 1)
const maxP95Ms = boundedFloat('LOAD_MAX_P95_MS', 500, 1, 60000)

const deadline = Date.now() + durationSeconds * 1000
const samples = []
let requests = 0
let failures = 0

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now()
    requests += 1
    try {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'error' })
      const elapsed = performance.now() - started
      samples.push(elapsed)
      if (response.status !== expectedStatus) failures += 1
      await response.body?.cancel()
    } catch {
      samples.push(performance.now() - started)
      failures += 1
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))

if (requests === 0) throw new Error('load test did not issue any request')
samples.sort((a, b) => a - b)
const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)]
const errorRate = failures / requests
const throughput = requests / durationSeconds

console.log(JSON.stringify({ baseUrl, path, concurrency, durationSeconds, requests, failures, errorRate, p95Ms: Number(p95.toFixed(2)), requestsPerSecond: Number(throughput.toFixed(2)) }, null, 2))

if (errorRate > maxErrorRate) throw new Error(`error rate ${errorRate.toFixed(4)} exceeds ${maxErrorRate.toFixed(4)}`)
if (p95 > maxP95Ms) throw new Error(`p95 ${p95.toFixed(2)}ms exceeds ${maxP95Ms.toFixed(2)}ms`)

function boundedInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback
}

function boundedFloat(name, fallback, min, max) {
  const value = Number.parseFloat(process.env[name] || '')
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback
}
