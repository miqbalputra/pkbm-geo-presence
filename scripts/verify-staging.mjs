const baseUrl = (process.env.STAGING_URL || 'http://localhost:8080').replace(/\/$/, '')

const checks = [
  { path: '/health/live', expected: 200 },
  { path: '/health/ready', expected: 200 },
  { path: '/version', expected: 200 },
  { path: '/api/v1/users', expected: 401 },
]

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: 'error' })
  if (response.status !== check.expected) {
    const body = await response.text()
    throw new Error(`${check.path}: expected ${check.expected}, got ${response.status}; body=${body.slice(0, 500)}`)
  }
  if (check.path.startsWith('/health') || check.path === '/version') {
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error(`${check.path}: response is not JSON`)
    }
  }
}

const headerResponse = await fetch(`${baseUrl}/health/live`, { redirect: 'error' })
const requiredHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': null,
  'referrer-policy': 'strict-origin-when-cross-origin',
}
for (const [name, expected] of Object.entries(requiredHeaders)) {
  const value = headerResponse.headers.get(name)
  if (!value || (expected && value !== expected)) {
    throw new Error(`missing or invalid security header: ${name}`)
  }
}

if (baseUrl.startsWith('https://') && !headerResponse.headers.get('strict-transport-security')) {
  throw new Error('HTTPS staging must return Strict-Transport-Security')
}

console.log(`Staging smoke gate passed: ${baseUrl}`)
