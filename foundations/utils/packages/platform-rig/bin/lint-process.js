/**
 * Copyright © 2026 Intabia Fusion.
 *
 * Licensed under the Eclipse Public License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may
 * obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Child process script for ESLint.
 * Receives { files, cwd, srcDir } via IPC, runs ESLint, sends result back.
 * Runs in its own process with generous --max-old-space-size.
 */

const { relative } = require('path')

process.on('message', async (msg) => {
  const { files, cwd } = msg

  try {
    let ESLint
    try {
      const eslintPath = require.resolve('eslint', { paths: [cwd] })
      ESLint = require(eslintPath).ESLint
    } catch {
      ESLint = require('eslint').ESLint
    }

    const eslint = new ESLint({ fix: false, cwd })
    const results = await eslint.lintFiles(files)

    let totalErrors = 0
    let totalWarnings = 0
    const errorMessages = []

    for (const result of results) {
      totalErrors += result.errorCount
      totalWarnings += result.warningCount

      for (const m of result.messages) {
        if (m.severity === 2) {
          errorMessages.push(`${relative(cwd, result.filePath)}(${m.line},${m.column}): ${m.message} [${m.ruleId}]`)
        }
      }
    }

    process.send({
      success: totalErrors === 0,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      fromCache: false,
      errors: errorMessages.length > 0 ? errorMessages : undefined
    })
  } catch (err) {
    process.send({
      success: false,
      errorCount: 1,
      warningCount: 0,
      fromCache: false,
      errors: [err.message]
    })
  }

  // Exit after single job — parent will fork a new process for next package
  process.exit(0)
})
