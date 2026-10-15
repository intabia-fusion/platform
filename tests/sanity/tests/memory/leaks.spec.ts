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

import { createRestTxOperations } from '@hcengineering/api-client'
import { type CDPSession, type Page } from '@playwright/test'
import { writeFile } from 'fs/promises'
import path from 'path'
import tracker from '@hcengineering/tracker'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { expect, type SharedWorkspace, test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { loginByToken, PlatformURI } from '../utils'
import { waitStable } from '../retry'

// Each scenario repeats one user action N times and compares the renderer between the middle and
// the end of the run: something created once on first use lands in the first half, a leak grows in
// both. LEAK_ITERATIONS=100 for a soak run; 20 keeps sanity short. At least 2: each half needs an iteration.
const iterations = Math.max(2, Number(process.env.LEAK_ITERATIONS ?? 20))
const warmup = 5

// Per-repeat growth that still passes. A leaked issue panel was ~1500 DOM nodes and ~1 MB of
// heap per open, a page kept alive by the clipboard ~50 MB per reload.
const maxNodesPerIteration = 20
const maxHeapMbPerIteration = 0.25

// Counted from the first navigation, so the transactor socket opened at login is included.
let framesSent = 0

interface Sample {
  nodes: number
  listeners: number
  documents: number
  heapMb: number
}

async function sample (cdp: CDPSession): Promise<Sample> {
  // Settled, not a fixed second: debounced handlers (toolbar cursor, list virtualisation), and the app a step opened
  // last can still be drawing its list - a sample taken mid-render read as ~50 nodes per iteration.
  await waitStable(async () => (await cdp.send('Memory.getDOMCounters')).nodes, { stableFor: 1000, interval: 200 })
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage')
  }
  const dom = await cdp.send('Memory.getDOMCounters')
  const heap = await cdp.send('Runtime.getHeapUsage')
  return {
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    documents: dom.documents,
    heapMb: Math.round(heap.usedSize / 1e5) / 10
  }
}

async function soak (page: Page, name: string, step: (i: number) => Promise<void>): Promise<void> {
  test.setTimeout(120_000 + (warmup + iterations) * 15_000)
  const cdp = await page.context().newCDPSession(page)
  for (let i = 0; i < warmup; i++) {
    await step(i)
  }
  // Work that piles up shows as a step getting slower or sending more frames, not as memory.
  const stepMs: number[] = []
  const stepFrames: number[] = []
  const half = Math.floor(iterations / 2)
  const before = await sample(cdp)
  let middle = before
  for (let i = 0; i < iterations; i++) {
    if (i === half) {
      middle = await sample(cdp)
    }
    const startedAt = Date.now()
    const startFrames = framesSent
    await step(warmup + i)
    stepMs.push(Date.now() - startedAt)
    stepFrames.push(framesSent - startFrames)
  }
  const after = await sample(cdp)
  // The smaller of both halves: a leak grows in each, while a one-off retention (~1800 nodes kept once, seen
  // between two steady levels) lands in one half and, spread over it, read as 180 nodes per iteration.
  const perIteration = (key: 'nodes' | 'heapMb'): number =>
    Math.min((middle[key] - before[key]) / half, (after[key] - middle[key]) / (iterations - half))
  const nodes = perIteration('nodes')
  const heapMb = perIteration('heapMb')
  const tenth = Math.max(1, Math.floor(iterations / 10))
  const avg = (values: number[]): number => Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  const trend = (values: number[]): string => `${avg(values.slice(0, tenth))} -> ${avg(values.slice(-tenth))}`
  const report =
    `${name}: ${iterations} iterations, before ${JSON.stringify(before)}, middle ${JSON.stringify(middle)}, ` +
    `after ${JSON.stringify(after)}, ` +
    `step ms ${trend(stepMs)}, ws frames sent per step ${trend(stepFrames)}`
  console.log(`[leak] ${report}`)
  test.info().annotations.push({ type: 'leak', description: report })
  expect.soft(nodes, `${name}: DOM nodes per iteration`).toBeLessThan(maxNodesPerIteration)
  expect.soft(heapMb, `${name}: heap MB per iteration`).toBeLessThan(maxHeapMbPerIteration)
  // A step 3x slower at the end means handlers pile up (FilterButton re-ran one per past mount).
  expect
    .soft(avg(stepMs.slice(-tenth)), `${name}: step ms at the end`)
    .toBeLessThan(avg(stepMs.slice(0, tenth)) * 3 + 200)
  if (process.env.LEAK_PROFILE !== undefined) {
    // A few extra steps after the measured run: what a slowed-down step spends its time on.
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
    for (let i = 0; i < 5; i++) {
      await step(warmup + iterations + i)
    }
    const { profile } = await cdp.send('Profiler.stop')
    await writeFile(
      path.join(process.env.LEAK_PROFILE, `${name.replace(/\W+/g, '-')}.cpuprofile`),
      JSON.stringify(profile)
    )
  }
}

async function createIssues (shared: SharedWorkspace, count: number): Promise<string[]> {
  if (shared.ws.token === undefined) throw new Error('No workspace token')
  const client = await createRestTxOperations(shared.ws.endpoint, shared.ws.workspace, shared.ws.token)
  try {
    const ctx = await getProjectContext(client)
    const identifiers: string[] = []
    for (let i = 0; i < count; i++) {
      const _id = await createIssue(client, ctx, { title: `Leak soak issue ${i}`, status: 'Backlog' })
      const created = await client.findOne(tracker.class.Issue, { _id })
      if (created === undefined) throw new Error(`Issue ${_id} was not stored`)
      identifiers.push(created.identifier)
    }
    return identifiers
  } finally {
    await client.close()
  }
}

// A fresh workspace opens the tracker without a list; the issues view of the default project has one.
const issuesApp = 'tracker/tracker%3Aproject%3ADefaultProject/issues'

test.describe('Renderer memory does not grow with repeated actions', () => {
  // The CDP heap and DOM counters exist only in Chromium.
  test.skip(({ browserName }) => browserName !== 'chromium')

  let shared: SharedWorkspace

  test.beforeEach(async ({ page, sharedWorkspace }) => {
    shared = await sharedWorkspace(0)
    framesSent = 0
    page.on('websocket', (ws) => {
      ws.on('framesent', () => {
        framesSent++
      })
    })
  })

  test('issue panel open and close', async ({ page }) => {
    const identifiers = await createIssues(shared, 5)
    await loginByToken(page, shared.token, shared.ws, issuesApp)
    await expect(page.locator(`a[href$="/${identifiers[0]}"]`).first()).toBeVisible()

    await soak(page, 'issue panel', async (i) => {
      await page
        .locator(`a[href$="/${identifiers[i % identifiers.length]}"]`)
        .first()
        .click()
      await expect(page.locator('.popupPanel .ProseMirror').first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.popupPanel')).toHaveCount(0)
    })
  })

  test('chat channel switching', async ({ page }) => {
    await loginByToken(page, shared.token, shared.ws, 'chunter')
    const channelPage = new ChannelPage(page)
    // Messages are sent from the UI: after REST messages from the same account the default
    // channels drop out of the navigator.
    const channels = ['general', 'random']
    const tag = Date.now()
    // A channel being left stays in the DOM, inert, while it fades out: its copy of the message is not the one on screen.
    for (const name of channels) {
      await channelPage.clickChannel(name)
      for (let i = 0; i < 5; i++) {
        await channelPage.sendMessage(`${name} ${tag} message ${i}`)
      }
      await expect(
        page.locator('.activityMessage:not([inert] *)', { hasText: `${name} ${tag} message 4` })
      ).toBeVisible()
    }

    await soak(page, 'chat channels', async (i) => {
      const name = channels[i % channels.length]
      await channelPage.clickChannel(name)
      await expect(
        page.locator('.activityMessage:not([inert] *)', { hasText: `${name} ${tag} message 4` })
      ).toBeVisible()
    })
  })

  test('application switching', async ({ page }) => {
    await loginByToken(page, shared.token, shared.ws, issuesApp)
    const menu = new LeftSideMenuPage(page)
    const apps = [
      async () => {
        await menu.clickChunter()
      },
      async () => {
        await menu.clickDocuments()
      },
      async () => {
        await menu.clickContacts()
      },
      async () => {
        await menu.clickPlanner()
      },
      async () => {
        await menu.clickTracker()
      }
    ]

    await soak(page, 'apps', async (i) => {
      for (const open of apps) {
        await open()
      }
    })
  })

  test('copy issue ID and reload', async ({ page }) => {
    const [identifier] = await createIssues(shared, 1)
    await loginByToken(page, shared.token, shared.ws, issuesApp)
    const issueLink = page.locator(`a[href$="/${identifier}"]`).first()

    // Chromium kept every ClipboardItem write in a persistent root, and with it the whole page
    // that wrote it, across reloads.
    await soak(page, 'copy + reload', async () => {
      await expect(issueLink).toBeVisible()
      await issueLink.click({ button: 'right' })
      await page.locator('div.popup button', { hasText: 'Copy issue ID to clipboard' }).click()
      await expect
        .poll(async () => await page.evaluate(async () => await navigator.clipboard.readText()))
        .toBe(identifier)
      await page.goto(`${PlatformURI}/workbench/${shared.ws.workspaceUrl}/${issuesApp}`)
    })
  })
})
