//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { AsyncLocalStorage } from 'async_hooks'
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { relative, resolve } from 'path'

const startedAt = Date.now()

/** Captured before the streams are patched, so progress lines never end up in an action log. */
const writeOut = process.stdout.write.bind(process.stdout)

/** Tail printed when an action fails; the file on disk always holds the full output. */
const FAIL_TAIL_LINES = 200

/** How often a still-running action reports itself, so a hang is visible instead of silent. */
const STILL_RUNNING_MS = 30000

interface Sink {
  file: string
}

const sinks = new AsyncLocalStorage<Sink>()

let logsDir: string | undefined
let actionNo = 0

function elapsed (from: number): string {
  return `${((Date.now() - from) / 1000).toFixed(1)}s`
}

function stamp (): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`.padStart(7)
}

/**
 * @public
 */
export function log (message: string): void {
  writeOut(`[${stamp()}] ${message}\n`)
}

/**
 * Routes what an action prints into its own file. AsyncLocalStorage, not a global swap: actions run
 * concurrently and async work started inside one keeps writing to it.
 */
function patchStreams (): void {
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream)
    stream.write = ((chunk: any, ...rest: any[]): boolean => {
      const sink = sinks.getStore()
      if (sink === undefined) return original(chunk, ...rest)
      appendFileSync(sink.file, typeof chunk === 'string' ? chunk : Buffer.from(chunk))
      const cb = rest.find((it) => typeof it === 'function')
      cb?.()
      return true
    }) as any
  }
}

/**
 * Directory for the per-action log files, recreated on every run.
 * @public
 */
export function initLogs (dir: string): void {
  if (logsDir !== undefined) return
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  logsDir = dir
  patchStreams()
  log(`logs: ${relative(process.cwd(), dir)}`)
}

function logFile (name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return resolve(logsDir ?? process.cwd(), `${String(++actionNo).padStart(3, '0')}-${slug}.log`)
}

function printTail (file: string): void {
  const lines = readFileSync(file, 'utf8').split('\n')
  const shown = lines.slice(-FAIL_TAIL_LINES)
  if (shown.length < lines.length) {
    writeOut(`--- ${relative(process.cwd(), file)} (last ${FAIL_TAIL_LINES} of ${lines.length} lines) ---\n`)
  } else {
    writeOut(`--- ${relative(process.cwd(), file)} ---\n`)
  }
  writeOut(shown.join('\n'))
  writeOut('\n--- end ---\n')
}

/**
 * Runs one step with its output collected into a file of its own: success prints one line, failure
 * prints the log. The file stays either way.
 * @public
 */
export async function action<T> (name: string, fn: () => Promise<T>): Promise<T> {
  if (logsDir === undefined) return await fn()
  const file = logFile(name)
  const from = Date.now()
  appendFileSync(file, `# ${name}\n`)
  // A hung command otherwise prints nothing at all: its own output goes to the file, and the line
  // that names it is only written once it returns.
  const ticker = setInterval(() => {
    log(`  ${name} still running (${elapsed(from)})`)
  }, STILL_RUNNING_MS)
  ticker.unref()
  try {
    const result = await sinks.run({ file }, fn)
    log(`  ${name} (${elapsed(from)})`)
    return result
  } catch (err: any) {
    log(`  ${name} FAILED in ${elapsed(from)}: ${err.message ?? err}`)
    printTail(file)
    throw err
  } finally {
    clearInterval(ticker)
  }
}

/**
 * @public
 */
export async function phase<T> (name: string, fn: () => Promise<T>): Promise<T> {
  const from = Date.now()
  log(`==> ${name}`)
  try {
    const result = await fn()
    log(`<== ${name}: ok in ${elapsed(from)}`)
    return result
  } catch (err: any) {
    log(`<== ${name}: FAILED in ${elapsed(from)}: ${err.message ?? err}`)
    throw err
  }
}

/**
 * Runs `fn` over items with a bounded number of concurrent executions, preserving result order.
 * @public
 */
export async function parallel<T, R> (items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx])
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker))
  return results
}
