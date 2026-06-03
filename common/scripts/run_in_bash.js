const { execSync } = require('child_process');
const command = process.argv.slice(2).join(' ');
execSync(`bash -c "${command}"`, { stdio: 'inherit' });