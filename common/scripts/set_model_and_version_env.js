const { execSync } = require('child_process')

function clean(value) {
  return value.trim().replace(/^["']|["']$/g, '')
}

process.env.MODEL_VERSION = clean(execSync('node ../common/scripts/show_version.js', { encoding: 'utf8' }))
process.env.VERSION = clean(execSync('node ../common/scripts/show_tag.js', { encoding: 'utf8' }))

const command = process.argv.slice(2).join(' ')
execSync(command, { stdio: 'inherit', shell: true })