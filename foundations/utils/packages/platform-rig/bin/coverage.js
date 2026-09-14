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
//   pnpm coverage --allow-failures   report even when a test failed (exit 0)
//
// Writes into coverage/: coverage-final.json (merged istanbul), lcov.info, cobertura-coverage.xml
// and html/. CI reads the cobertura file; the last line of the output is the summary GitLab's
// `coverage:` regex matches.
//
// Two runners produce it: jest for everything with a jest.config.js, vitest for packages/ui.
// Their istanbul JSON reports are merged here; a package with no tests at all is not in either
// report and is listed separately, since it cannot be distinguished from 0% any other way.

const { spawnSync } = require('child_process')
const { join, relative } = require('path')
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('fs')
const libCoverage = require('istanbul-lib-coverage')
const libReport = require('istanbul-lib-report')
const istanbulReports = require('istanbul-reports')
const { GROUPS, jestConfigPath, planTestRun, collectTestEntries, buildSharedConfig, findJestBin } = require('./libs/test-groups')
const { listWorkspaceProjects, findWorkspaceRoot } = require('./libs/workspace')

const args = process.argv.slice(2)
const groups = ['unit', ...(args.includes('--integration') ? ['integration'] : [])]
const allowFailures = args.includes('--allow-failures')
let failed = false

const root = findWorkspaceRoot()
const outDir = join(root, 'coverage')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// Project-relative, because in a multi-project run jest matches this against every project's own
// rootDir. A repo-relative pattern (`plugins/x/src/**`) matches nothing and reports zero files.
const COLLECT_FROM = ['src/**/*.ts', '!**/__tests__/**', '!**/__test__/**', '!**/*.{test,spec,itest,bench}.ts']

/** One jest run over a group, its istanbul JSON left under `<outDir>/<group>-<n>`. */
function runJest (group) {
  const entries = collectTestEntries(root, group)
  if (entries.length === 0) return null
  const sharedJestBin = findJestBin(entries)
  if (sharedJestBin == null) throw new Error('jest not found in any workspace package; run pnpm install')

  // Everything classify() clears goes into one run, exactly as `pnpm test` does it. The rest each
  // get their own jest: a package whose config is itself a multi-project (desktop, presentation)
  // loses its preset when flattened into a project, and falls back to babel — which cannot parse TS.
  const { shared, isolated } = planTestRun(entries)
  const isolatedNames = new Set(isolated.map((i) => i.name))
  const own = entries.filter((e) => isolatedNames.has(e.name) && runsJest(e))

  const reports = []
  let n = 0
  const collectFlags = COLLECT_FROM.flatMap((p) => ['--collectCoverageFrom', p])

  /**
   * @param {(dir: string) => string[]} argsFor
   * @param {string[]} taken flags the invocation already carries; jest turns a repeated flag into
   *   an array and dies with `paths[1] must be of type string`, so they are never appended twice.
   */
  const run = (label, cwd, argsFor, bin = sharedJestBin, taken = [], reportDir) => {
    const dir = join(outDir, `${group}-${n++}`)
    const add = (flag, ...args) => (taken.includes(flag) ? [] : args)
    const coverageArgs = [
      ...add('--coverage', '--coverage'),
      ...collectFlags,
      ...add('--coverageReporters', '--coverageReporters=json'),
      ...add('--coverageDirectory', `--coverageDirectory=${dir}`),
      ...add('--silent', '--silent')
    ]
    const [cmd, ...prefix] = Array.isArray(bin) ? bin : [bin]
    const status = spawnSync(cmd, [...prefix, ...argsFor(dir), ...coverageArgs],
      { cwd, stdio: ['ignore', 'ignore', 'inherit'] }).status
    if (status !== 0) {
      failed = true
      console.error(`  jest exited ${status} for ${label}; coverage below is partial`)
    }
    reports.push(join(reportDir ?? dir, 'coverage-final.json'))
  }

  if (shared !== null) {
    const { projects, testTimeout } = buildSharedConfig(shared, group)
    const configPath = join(outDir, `${group}-shared.config.js`)
    writeFileSync(configPath, `module.exports = ${JSON.stringify({ projects }, null, 2)}\n`)
    console.log(`  ${shared.packages.length} packages as one jest`)
    run(`${group} shared run`, root, () => [
      '-c', configPath, ...shared.flags,
      ...(testTimeout !== undefined ? [`--testTimeout=${testTimeout}`] : [])
    ])
  }
  for (const pkg of own) {
    console.log(`  ${pkg.name} on its own`)
    const match = GROUPS[group].testMatch
    // Instrumentation is slower than the run these tests were timed against; network-backrpc's
    // zmq suite times out at the 5s default under coverage on a CI runner.
    const extra = [`--testTimeout=${GROUPS[group].testTimeout ?? 30000}`,
      ...(match !== undefined ? ['--testMatch', ...match] : [])]
    // Through the package's own script where it has one. Spawning jest directly instead is what
    // `pnpm test` never does, and desktop's jsdom project then fails to compile its own test files
    // (`Cannot find name 'describe'`) while the same config passes under `pnpm run test`.
    const script = testScript(pkg)
    if (script !== undefined) {
      const text = JSON.parse(readFileSync(join(pkg.cwd, 'package.json'), 'utf-8')).scripts[script]
      const taken = [...text.matchAll(/(--[\w-]+)/g)].map((m) => m[1])
      // A script that already names its own coverage directory keeps it; the report is read there.
      const own = /--coverageDirectory[= ]([^\s]+)/.exec(text)
      run(pkg.name, pkg.cwd, () => extra.filter((f) => !taken.includes(f.split('=')[0])),
        ['pnpm', 'run', script], taken, own === null ? undefined : join(pkg.cwd, own[1]))
    } else {
      run(pkg.name, pkg.cwd, () => ['-c', jestConfigPath(pkg.cwd), '--passWithNoTests', '--forceExit', ...extra],
        findJestBin([pkg]) ?? sharedJestBin)
    }
  }
  return reports
}

/**
 * Playwright suites and the ws-tests runners keep a jest.config.js they never use from `pnpm test`;
 * started here they would run an e2e suite against a stand that is not there.
 */
function runsJest (e) {
  if (jestConfigPath(e.cwd) === null) return false
  const scripts = JSON.parse(readFileSync(join(e.cwd, 'package.json'), 'utf-8')).scripts ?? {}
  const script = scripts.test ?? scripts['_phase:test']
  return script === undefined || script.trim().startsWith('jest')
}

/** The npm script that runs this package's jest, if it has one. */
function testScript (e) {
  const scripts = JSON.parse(readFileSync(join(e.cwd, 'package.json'), 'utf-8')).scripts ?? {}
  for (const name of ['test', '_phase:test']) {
    if (scripts[name]?.trim().startsWith('jest') === true) return name
  }
  return undefined
}

/** Packages on vitest (no jest.config.js, but a test script of their own). */
function runVitest () {
  const reports = []
  for (const p of listWorkspaceProjects(root)) {
    if (existsSync(join(p.fullPath, 'jest.config.js'))) continue
    if (!existsSync(join(p.fullPath, 'vitest.config.mts'))) continue
    console.log(`  vitest: ${p.name}`)
    const status = spawnSync('pnpm', ['exec', 'vitest', 'run', '--silent', '--coverage'], {
      cwd: p.fullPath,
      stdio: ['ignore', 'ignore', 'inherit']
    }).status
    if (status !== 0) {
      failed = true
      console.error(`  vitest exited ${status} for ${p.name}; coverage below is partial`)
    }
    const report = join(p.fullPath, 'coverage', 'coverage-final.json')
    if (existsSync(report)) reports.push(report)
  }
  return reports
}

const reports = []
for (const group of groups) {
  console.log(`Running ${group} tests with coverage...`)
  reports.push(...(runJest(group) ?? []))
}
console.log('Running vitest packages with coverage...')
reports.push(...runVitest())

// A file can appear in more than one report (two projects importing it), so the maps are merged
// rather than spread: istanbul sums the counters per statement, branch and function.
const coverageMap = libCoverage.createCoverageMap({})
for (const path of reports) {
  if (!existsSync(path)) continue
  coverageMap.merge(libCoverage.createCoverageMap(JSON.parse(readFileSync(path, 'utf-8'))))
}
const merged = coverageMap.toJSON()
writeFileSync(join(outDir, 'coverage-final.json'), JSON.stringify(merged))

const context = libReport.createContext({ dir: outDir, coverageMap, defaultSummarizer: 'nested' })
istanbulReports.create('lcovonly', { file: 'lcov.info' }).execute(context)
istanbulReports.create('cobertura', { file: 'cobertura-coverage.xml', projectRoot: root }).execute(context)
istanbulReports.create('html', { subdir: 'html' }).execute(context)

// Roll the per-file counters up to the package that owns the file: longest path first, so a
// package nested inside another one wins.
const projects = listWorkspaceProjects(root).sort((a, b) => b.fullPath.length - a.fullPath.length)
const perPackage = new Map(projects.map((p) => [p.name, { files: 0, covered: 0, total: 0 }]))
let covered = 0
let totalStatements = 0
for (const [file, entry] of Object.entries(merged)) {
  const counts = Object.values(entry.s ?? {})
  const hit = counts.filter((v) => v > 0).length
  covered += hit
  totalStatements += counts.length
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
console.log(`\n  TOTAL ${pct(covered, totalStatements)}  ${covered}/${totalStatements} statements over ${Object.keys(merged).length} files in ${rows.length} packages`)
console.log(`  ${noTests.length} more packages have a src/ but no ${groups.join('/')} test at all, and are not in the number above`)
for (const name of ['coverage-final.json', 'lcov.info', 'cobertura-coverage.xml', 'html/index.html']) {
  console.log(`  ${relative(root, join(outDir, name))}`)
}

// Last line, and the one GitLab's `coverage:` regex reads. Keep the wording in step with
// .gitlab-ci.yml if it ever changes.
const total = (covered / totalStatements * 100).toFixed(2)
console.log(`\nCoverage: ${total}% of statements`)

if (failed && !allowFailures) {
  console.error('\nTests failed; the report above covers only what ran.')
  process.exit(1)
}
