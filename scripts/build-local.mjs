import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm'
const args = isWindows
  ? ['/d', '/s', '/c', 'npm.cmd run build -- --emptyOutDir=false']
  : ['run', 'build', '--', '--emptyOutDir=false']
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: '/api' },
})

if (result.error) {
  console.error(result.error)
}

process.exit(result.status ?? 1)
