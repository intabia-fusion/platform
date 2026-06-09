const { execFileSync, spawnSync } = require('child_process')
const path = require('path')

function clean(value) {
  return value.trim().replace(/^["']|["']$/g, '')
}

function run(script) {
  return clean(execFileSync(process.execPath, [path.join(__dirname, script)], { encoding: 'utf8' }))
}

process.env.MODEL_VERSION = run('show_version.js')
process.env.VERSION = run('show_tag.js')

const [command, ...args] = process.argv.slice(2)
if (command === undefined) {
  console.error('set_model_and_version_env: no command provided')
  process.exit(1)
}

// shell only on Windows for .cmd shims; elsewhere avoid arg re-parsing
const res = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
if (res.error) {
  console.error(res.error)
}
process.exit(res.status ?? 1)