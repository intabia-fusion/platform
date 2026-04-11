#!/usr/bin/env node

/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { parentPort, threadId } = require('worker_threads')
const { join, relative, basename } = require('path')
const { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync } = require('fs')

const prettier = require('prettier')
const { ESLint } = require('eslint')

let pluginSvelte
try {
  pluginSvelte = require('prettier-plugin-svelte')
} catch {
  // optional
}

function collectSourceFiles(dir, result = []) {
  if (!existsSync(dir)) return result
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = lstatSync(full)
    if (stat.isDirectory()) {
      collectSourceFiles(full, result)
    } else {
      const name = basename(full)
      if (name.endsWith('.d.ts')) continue
      if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.svelte')) {
        result.push(full)
      }
    }
  }
  return result
}

async function runPrettierInMemory(files, cwd) {
  const output = new Map() // file -> Buffer (formatted content)
  const errors = []

  for (const file of files) {
    try {
      const options = await prettier.resolveConfig(file)
      const info = await prettier.getFileInfo(file)
      if (info.ignored) continue

      const input = readFileSync(file, 'utf8')
      const prettierOptions = {
        ...(options || {}),
        filepath: file,
        plugins: []
      }
      if (pluginSvelte && file.endsWith('.svelte')) {
        prettierOptions.plugins = [pluginSvelte]
        prettierOptions.parser = 'svelte'
      }

      const formatted = await prettier.format(input, prettierOptions)
      output.set(file, formatted)
    } catch (err) {
      errors.push(`${relative(cwd, file)}: ${err.message}`)
    }
  }

  return { output, errors }
}

/**
 * Run ESLint with fix on in-memory sources.
 * Uses lintText so we avoid writing unchanged files to disk (webpack triggers).
 */
async function runEslintFixInMemory(sourceMap, cwd) {
  const eslint = new ESLint({ fix: true, cwd })
  const results = []
  const fixed = new Map()
  const errors = []

  for (const [file, content] of sourceMap) {
    // lintText with filePath so ESLint picks up the right config
    try {
      const fileResults = await eslint.lintText(content, { filePath: file })
      const r = fileResults[0]
      results.push(r)
      if (r.output !== undefined) {
        fixed.set(file, r.output)
      } else {
        fixed.set(file, content)
      }
      if (r.errorCount > 0 && r.output === undefined) {
        // Non-fixable errors
      }
    } catch (err) {
      errors.push(`${relative(cwd, file)}: ${err.message}`)
    }
  }

  return { fixed, results, errors }
}

/**
 * Format a package: prettier → eslint --fix, all in-memory.
 * Writes back only files whose final content differs from disk.
 */
async function formatPackage(cwd, options = {}) {
  const { srcDir = 'src' } = options
  const srcPath = join(cwd, srcDir)

  const files = collectSourceFiles(srcPath)
  if (files.length === 0) {
    return { success: true, changed: 0, total: 0, errors: [] }
  }

  // Step 1: prettier in memory
  const { output: prettierOut, errors: prettierErrors } = await runPrettierInMemory(files, cwd)

  // Build source map for eslint (files that prettier processed)
  const afterPrettier = new Map()
  for (const file of files) {
    if (prettierOut.has(file)) {
      afterPrettier.set(file, prettierOut.get(file))
    } else {
      // fallback: original content
      try { afterPrettier.set(file, readFileSync(file, 'utf8')) } catch { /* skip */ }
    }
  }

  // Step 2: eslint --fix in memory
  const { fixed, results, errors: eslintErrors } = await runEslintFixInMemory(afterPrettier, cwd)

  // Collect lint formatter output for logs
  const formatter = await (new ESLint({ cwd })).loadFormatter('stylish')
  const resultText = formatter.format(results)

  const hasLintErrors = results.some((r) => r.errorCount > 0)

  // Step 3: write back only changed files (diff by buffer)
  let changedCount = 0
  const writeErrors = []
  for (const file of files) {
    const newContent = fixed.get(file)
    if (newContent === undefined) continue
    try {
      const current = readFileSync(file, 'utf8')
      if (current !== newContent) {
        writeFileSync(file, newContent, 'utf8')
        changedCount++
      }
    } catch (err) {
      writeErrors.push(`${relative(cwd, file)}: ${err.message}`)
    }
  }

  const allErrors = [...prettierErrors, ...eslintErrors, ...writeErrors]

  return {
    success: !hasLintErrors && allErrors.length === 0,
    changed: changedCount,
    total: files.length,
    errors: allErrors,
    lintOutput: resultText,
    hasLintErrors
  }
}

if (parentPort) {
  parentPort.on('message', async (task) => {
    const { id, type, cwd } = task

    if (type === 'format') {
      try {
        const result = await formatPackage(cwd, { srcDir: task.srcDir || 'src' })
        parentPort.postMessage({ id, threadId, ...result })
      } catch (err) {
        parentPort.postMessage({ id, threadId, success: false, error: err.stack || err.message || String(err) })
      }
    } else if (type === 'exit') {
      process.exit(0)
    }
  })

  parentPort.postMessage({ type: 'ready', threadId })
}

module.exports = { formatPackage }
