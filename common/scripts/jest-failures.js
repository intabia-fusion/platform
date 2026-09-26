#!/usr/bin/env node
// What failed in jest `--json` reports: a count per report, then every failed test as
// `file › test` with the head of its error. Usage: jest-failures.js <report.json>...
const { existsSync, readFileSync } = require('fs')
const { relative } = require('path')

const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '')
// The assertion and its Expected/Received lines, without the stack or the code frame.
const head = (text) =>
  stripAnsi(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .slice(0, 4)
    .filter((l, i, all) => !all.slice(0, i + 1).some((x) => x.startsWith('at ') || /^>?\s*\d+ \|/.test(x)))
    .map((l) => (l.length > 200 ? l.slice(0, 200) + '...' : l))

for (const path of process.argv.slice(2)) {
  if (!existsSync(path)) {
    console.log(`  ${path}: no report - the run did not get as far as jest`)
    continue
  }
  const report = JSON.parse(readFileSync(path, 'utf-8'))
  console.log(`  ${path}: ${report.numFailedTests} failed, ${report.numPassedTests} passed, ` +
    `${report.numFailedTestSuites} of ${report.numTotalTestSuites} suites failed`)
  for (const suite of report.testResults) {
    const file = relative(process.cwd(), suite.name)
    const failed = suite.assertionResults.filter((a) => a.status === 'failed')
    // A suite that failed to run (setup, compile, crashed worker) has no failed assertions.
    if (failed.length === 0 && suite.status === 'failed') {
      console.log(`    ${file}`)
      for (const l of head(suite.message)) console.log(`      ${l}`)
    }
    for (const a of failed) {
      console.log(`    ${file} › ${a.fullName}`)
      for (const l of head(a.failureMessages[0])) console.log(`      ${l}`)
    }
  }
}
