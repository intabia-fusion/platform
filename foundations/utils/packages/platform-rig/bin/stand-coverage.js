#!/usr/bin/env node
/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

// Coverage of the server code that runs inside the stand's containers - what api-tests/,
// the Playwright suites and anything else driving a live stand actually exercise.
//
//   node bin/stand-coverage.js [--profiles api-tests/coverage] [--out coverage-stand.json]
//
// The containers are started with NODE_V8_COVERAGE pointing at a mounted directory (see
// api-tests/docker-compose.coverage.yaml), so each pod drops a V8 profile of its own bundle when it
// exits. Those profiles are per-bundle, not per-source-file; the pods' esbuild bundles carry an
// external sourcemap, which is what turns a profile back into the repository's `src/` files here.
//
// Two things this cannot do: a pod killed with SIGKILL writes nothing (the stand has to be stopped,
// not torn down), and the bundle on disk must be the one in the image - rebuild images before a
// run, or the sourcemap maps ranges of one build onto the lines of another.

const { join, relative, resolve } = require('path')
const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('fs')
const libCoverage = require('istanbul-lib-coverage')
const v8toIstanbul = require('v8-to-istanbul')
const { listWorkspaceProjects, findWorkspaceRoot } = require('./libs/workspace')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}

const root = findWorkspaceRoot()
const profilesDir = resolve(root, flag('--profiles', join('api-tests', 'coverage')))
// Not inside coverage/: `pnpm coverage` wipes that directory, and a stand run is expensive to redo.
const outFile = resolve(root, flag('--out', 'coverage-stand.json'))

/** Image name -> package directory, read off each package's own docker:build script. */
function imageDirs () {
  const map = new Map()
  for (const p of listWorkspaceProjects(root)) {
    const pkg = join(p.fullPath, 'package.json')
    if (!existsSync(pkg)) continue
    const scripts = JSON.parse(readFileSync(pkg, 'utf-8')).scripts ?? {}
    for (const script of Object.values(scripts)) {
      const m = /docker_build\.sh\s+(\S+)/.exec(script ?? '')
      if (m === null) continue
      map.set(m[1].replace(/^.*\//, ''), p.fullPath)
    }
  }
  return map
}

/** Everything a pod's profile says about the repository, as an istanbul file map. */
async function convert (service, dir, bundle) {
  const profiles = readdirSync(dir).filter((f) => f.startsWith('coverage-') && f.endsWith('.json'))
  if (profiles.length === 0) return null
  const source = readFileSync(bundle, 'utf-8')
  const sourceMap = { sourcemap: JSON.parse(readFileSync(bundle + '.map', 'utf-8')) }
  const map = libCoverage.createCoverageMap({})
  let used = 0
  for (const file of profiles) {
    const { result } = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
    // Only the pod's own bundle: the rest of the profile is node internals and native shims.
    const script = result.find((r) => r.url.endsWith('/bundle.js'))
    if (script === undefined) continue
    const converter = v8toIstanbul(bundle, 0, { source, sourceMap })
    await converter.load()
    converter.applyCoverage(script.functions)
    const istanbul = converter.toIstanbul()
    converter.destroy()
    for (const [path, entry] of Object.entries(istanbul)) {
      if (path.includes('node_modules') || path.endsWith('bundle.js')) continue
      if (!path.startsWith(root + '/')) continue
      // esbuild plugin namespaces (`bundle/ignore-arrow:apache-arrow`) map to no file; the colon also
      // breaks the artifact upload of the html report.
      if (!existsSync(path)) continue
      map.merge({ [path]: entry })
    }
    used++
  }
  console.log(`  ${service}: ${used} profile(s), ${Object.keys(map.toJSON()).length} files`)
  return map
}

async function main () {
  if (!existsSync(profilesDir)) {
    console.error(`No profiles in ${relative(root, profilesDir)} - run the api-tests with STAND_COVERAGE=true.`)
    process.exit(1)
  }
  const dirs = imageDirs()
  const total = libCoverage.createCoverageMap({})
  const missing = []
  for (const service of readdirSync(profilesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const pkgDir = dirs.get(service.name)
    if (pkgDir === undefined) {
      missing.push(`${service.name}: no package builds an image by that name`)
      continue
    }
    const bundle = join(pkgDir, 'bundle', 'bundle.js')
    if (!existsSync(bundle) || !existsSync(bundle + '.map')) {
      missing.push(`${service.name}: ${relative(root, bundle)}(.map) is not there - run \`pnpm bundle --to\` for it`)
      continue
    }
    const map = await convert(service.name, join(profilesDir, service.name), bundle)
    if (map !== null) total.merge(map)
  }
  for (const line of missing) console.error(`  skipped ${line}`)

  const json = total.toJSON()
  mkdirSync(join(outFile, '..'), { recursive: true })
  writeFileSync(outFile, JSON.stringify(json))

  let covered = 0
  let statements = 0
  for (const entry of Object.values(json)) {
    const counts = Object.values(entry.s ?? {})
    covered += counts.filter((v) => v > 0).length
    statements += counts.length
  }
  const pct = statements === 0 ? 0 : (covered / statements) * 100
  console.log(`\n  STAND ${pct.toFixed(1)}%  ${covered}/${statements} statements over ${Object.keys(json).length} files`)
  console.log(`  ${relative(root, outFile)} - pass it to \`pnpm coverage --stand\` to fold it into the whole-repo number`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
