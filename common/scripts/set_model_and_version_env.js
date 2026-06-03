const { execSync } = require('child_process')

process.env.MODEL_VERSION = execSync('node ../common/scripts/show_version.js', { encoding: 'utf8' }).trim()
process.env.VERSION = execSync('node ../common/scripts/show_tag.js', { encoding: 'utf8' }).trim()

const command = process.argv.slice(2).join(' ')
execSync(command, { stdio: 'inherit', shell: true })