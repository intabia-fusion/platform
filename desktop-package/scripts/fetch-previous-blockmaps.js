#!/usr/bin/env node
// Copy blockmaps of previous releases from the live dist into `deploy` before the image build.
// Usage: node scripts/fetch-previous-blockmaps.js [deployDir] [baseUrl] [--limit=5]
const path = require('path')
require('ts-node').register({ transpileOnly: true, project: path.join(__dirname, '..', 'tsconfig.json') })
const { fetchPreviousBlockmaps } = require(path.join(__dirname, '..', 'src', 'previousBlockmaps.ts'))

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const dir = args[0] ?? 'deploy'
const baseUrl = args[1] ?? 'https://platform.intabia.ru/_dist'
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 5

fetchPreviousBlockmaps(dir, baseUrl, limit).then(
  (releases) => {
    for (const { version, files } of releases) {
      console.log(`${version}: ${files.join(', ')}`)
    }
  },
  (err) => {
    // Only differential updates suffer without them, so never fail the release over it.
    console.warn(`Previous blockmaps not fetched: ${err}`)
  }
)
