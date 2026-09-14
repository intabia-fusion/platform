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

// Coverage for the whole workspace, as one number and one table.
//
//   pnpm coverage                    unit tests only
//   pnpm coverage --integration      unit + integration (needs tests/prepare-tests.sh)
//   pnpm coverage --html             also write an HTML report
//
// Two runners produce it: jest for everything with a jest.config.js, vitest for packages/ui.
// Their istanbul JSON reports are merged here; a package with no tests at all is not in either
// report and is listed separately, since it cannot be distinguished from 0% any other way.

const { spawnSync } = require('child_process')
const { join, relative } = require('path')
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('fs')
const { jestConfigPath, planTestRun, collectTestEntries, buildSharedConfig, findJestBin } = require('./libs/test-groups')
const { listWorkspaceProjects, findWorkspaceRoot } = require('./libs/workspace')

const args = process.argv.slice(2)
const groups = ['unit', ...(args.includes('--integration') ? ['integration'] : [])]
const wantHtml = args.includes('--html')

const root = findWorkspaceRoot()
const outDir = join(root, 'coverage')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// Project-relative, because in a multi-project run jest matches this against every project's own
// rootDir. A repo-relative pattern (`plugins/x/src/**`) matches nothing and reports zero files.
const COLLECT_FROM = ['src/**/*.ts', '!**/__tests__/**', '!**/__test__/**', '!**/*.{test,spec,itest,bench}.ts']

/** One jest run over a group, its istanbul JSON left in `<outDir>/<group>`. */
function runJest (group) {
  const entries = collectTestEntries(root, group)
  if (entries.length === 0) return null
  const { shared, isolated } = planTestRun(entries)
  const exclusive = new Set(isolated.filter((i) => i.exclusive).map((i) => i.name))
  // Playwright suites and the ws-tests runners keep a jest.config.js they never use from `pnpm
  // test`; pulled in as projects they would start an e2e run against a stand that is not there.
  const runsJest = (e) => {
    if (jestConfigPath(e.cwd) === null) return false
    const scripts = JSON.parse(readFileSync(join(e.cwd, 'package.json'), 'utf-8')).scripts ?? {}
    const script = scripts.test ?? scripts['_phase:test']
    return script === undefined || script.trim().startsWith('jest')
  }
  // Coverage does not need the stand to itself the way a kafka topic budget does, but an
  // exclusive package still cannot share the run, so it gets its own pass and its own report.
  const batches = [entries.filter((e) => !exclusive.has(e.name) && runsJest(e))]
  for (const e of entries.filter((x) => exclusive.has(x.name))) batches.push([e])

  const jestBin = findJestBin(entries)
  if (jestBin == null) throw new Error('jest not found in any workspace package; run pnpm install')
  const reports = []
  batches.forEach((packages, i) => {
    if (packages.length === 0) return
    const { projects, testTimeout } = buildSharedConfig({ packages }, group)
    const dir = join(outDir, `${group}-${i}`)
    const configPath = join(outDir, `${group}-${i}.config.js`)
    writeFileSync(configPath, `module.exports = ${JSON.stringify({ projects }, null, 2)}\n`)
    const args = [
      '-c', configPath, ...(shared?.flags ?? ['--passWithNoTests', '--forceExit']), '--silent', '--coverage',
      ...COLLECT_FROM.flatMap((p) => ['--collectCoverageFrom', p]),
      '--coverageReporters=json', `--coverageDirectory=${dir}`
    ]
    if (testTimeout !== undefined) args.push(`--testTimeout=${testTimeout}`)
    const status = spawnSync(jestBin, args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }).status
    if (status !== 0) console.error(`  jest exited ${status} for ${group} batch ${i}; coverage below is partial`)
    reports.push(join(dir, 'coverage-final.json'))
  })
  return reports
}

/** Packages on vitest (no jest.config.js, but a test script of their own). */
function runVitest () {
  const reports = []
  for (const p of listWorkspaceProjects(root)) {
    if (existsSync(join(p.fullPath, 'jest.config.js'))) continue
    if (!existsSync(join(p.fullPath, 'vitest.config.mts'))) continue
    console.log(`  vitest: ${p.name}`)
    spawnSync('pnpm', ['exec', 'vitest', 'run', '--silent', '--coverage'], {
      cwd: p.fullPath,
      stdio: ['ignore', 'ignore', 'inherit']
    })
    const report = join(p.fullPath, 'coverage', 'coverage-final.json')
    if (existsSync(report)) reports.push(report)
  }
  return reports
}

/** Sums two istanbul file entries; the same file can be hit by more than one run. */
function mergeInto (acc, file, entry) {
  const prev = acc[file]
  if (prev === undefined) {
    acc[file] = entry
    return
  }
  for (const key of ['s', 'f']) {
    for (const id of Object.keys(entry[key] ?? {})) prev[key][id] = (prev[key][id] ?? 0) + entry[key][id]
  }
  for (const id of Object.keys(entry.b ?? {})) {
    prev.b[id] = (prev.b[id] ?? entry.b[id].map(() => 0)).map((v, i) => v + entry.b[id][i])
  }
}

const reports = []
for (const group of groups) {
  console.log(`Running ${group} tests with coverage...`)
  reports.push(...(runJest(group) ?? []))
}
console.log('Running vitest packages with coverage...')
reports.push(...runVitest())

const merged = {}
for (const path of reports) {
  if (!existsSync(path)) continue
  const data = JSON.parse(readFileSync(path, 'utf-8'))
  for (const [file, entry] of Object.entries(data)) mergeInto(merged, file, entry)
}
writeFileSync(join(outDir, 'coverage-final.json'), JSON.stringify(merged))

// Roll the per-file counters up to the package that owns the file: longest path first, so a
// package nested inside another one wins.
const projects = listWorkspaceProjects(root).sort((a, b) => b.fullPath.length - a.fullPath.length)
const perPackage = new Map(projects.map((p) => [p.name, { files: 0, covered: 0, total: 0 }]))
let covered = 0
let total = 0
for (const [file, entry] of Object.entries(merged)) {
  const counts = Object.values(entry.s ?? {})
  const hit = counts.filter((v) => v > 0).length
  covered += hit
  total += counts.length
  const owner = projects.find((p) => file.startsWith(p.fullPath + '/'))
  if (owner === undefined) continue
  const acc = perPackage.get(owner.name)
  acc.files++
  acc.covered += hit
  acc.total += counts.length
}

const pct = (c, t) => (t === 0 ? '  n/a' : ((c / t) * 100).toFixed(1).padStart(5) + '%')
const withTests = new Set(groups.flatMap((g) => collectTestEntries(root, g)).map((e) => e.name))
const noTests = projects
  .filter((p) => !withTests.has(p.name) && perPackage.get(p.name).files === 0 && existsSync(join(p.fullPath, 'src')))
  .map((p) => p.name)

const rows = [...perPackage.entries()].filter(([, v]) => v.total > 0).sort((a, b) => a[1].covered / a[1].total - b[1].covered / b[1].total)
console.log('\n=== Coverage by package (statements, worst first) ===')
for (const [name, v] of rows) {
  console.log(`  ${pct(v.covered, v.total)}  ${String(v.covered).padStart(6)}/${String(v.total).padEnd(6)} ${name}`)
}
console.log(`\n  TOTAL ${pct(covered, total)}  ${covered}/${total} statements over ${Object.keys(merged).length} files in ${rows.length} packages`)
console.log(`  ${noTests.length} more packages have a src/ but no ${groups.join('/')} test at all, and are not in the number above`)
console.log(`\n  merged report: ${relative(root, join(outDir, 'coverage-final.json'))}`)

if (wantHtml) {
  const nyc = join(root, 'node_modules', '.bin', 'nyc')
  if (!existsSync(nyc)) {
    console.log('  --html needs nyc: pnpm add -w -D nyc')
  } else {
    spawnSync(nyc, ['report', '-t', outDir, '--report-dir', join(outDir, 'html'), '--reporter=html'], { cwd: root, stdio: 'inherit' })
    console.log(`  html report: ${relative(root, join(outDir, 'html', 'index.html'))}`)
  }
}
