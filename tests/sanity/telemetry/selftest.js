#!/usr/bin/env node
//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// How a stopped run is classified - the part of the telemetry that decides what a series counts as
// a defect. Run it after touching collect-run.js or stability.js:
//
//   node telemetry/selftest.js
//
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const HERE = __dirname

function spec (title, statuses) {
  return {
    title,
    tests: [
      {
        projectName: 'Platform',
        results: statuses.map((status, i) => ({
          status,
          duration: 100,
          retry: i,
          workerIndex: 0,
          startTime: new Date(1700000000000 + i * 1000).toISOString()
        }))
      }
    ]
  }
}

function collect (dir, specs) {
  fs.mkdirSync(dir, { recursive: true })
  const report = { suites: [{ file: 'a.spec.ts', specs }] }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report))
  fs.writeFileSync(path.join(dir, 'steps.ndjson'), '')
  execFileSync(
    process.execPath,
    [path.join(HERE, 'collect-run.js'), '--dir', dir, '--report', path.join(dir, 'report.json'), '--steps', path.join(dir, 'steps.ndjson')],
    { stdio: 'pipe' }
  )
  return JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'))
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-selftest-'))
try {
  const stopped = collect(path.join(tmp, 'runs', 'stopped'), [
    spec('finished before the stop', ['passed']),
    spec('still running at the stop', ['interrupted']),
    // A real failure that the stop caught on its retry is still a failure.
    spec('failed, then the stop caught the retry', ['failed', 'interrupted']),
    // `test.skip` is not a stop: a suite normally skips dozens, which would mark every run partial.
    spec('skipped by the suite', ['skipped'])
  ])
  assert.strictEqual(stopped.partial, true, 'a run with interrupted tests is partial')
  assert.strictEqual(stopped.totals.interrupted, 1, 'only the untouched test counts as interrupted')
  assert.deepStrictEqual(
    stopped.failed.map((t) => t.title),
    ['failed, then the stop caught the retry'],
    'a failure interrupted on retry must stay a failure'
  )

  const whole = collect(path.join(tmp, 'runs', 'whole'), [
    spec('green', ['passed']),
    spec('flaked once', ['failed', 'passed']),
    spec('skipped by the suite', ['skipped'])
  ])
  assert.strictEqual(whole.partial, false, 'skipped tests alone must not make a run partial')
  assert.strictEqual(whole.totals.interrupted, 0)
  assert.strictEqual(whole.totals.skipped, 1)
  assert.strictEqual(whole.totals.flaky, 1)
  assert.strictEqual(whole.failed.length, 0)

  const out = execFileSync(process.execPath, [path.join(HERE, 'stability.js'), 'stopped'], {
    cwd: tmp,
    encoding: 'utf8'
  })
  assert.match(out, /stopped, not counted below/, 'the row says the run was stopped')
  assert.match(out, /every run in this window was stopped/, 'and nothing is tallied from it')

  console.log('telemetry selftest: ok')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
