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
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { waitForImages } from './print'

jest.mock('./config', () => ({ __esModule: true, default: { PuppeteerArgs: [] } }))

// Real Chromium, with intercepted HTTP responses instead of an external file service.
describe('PDF content images', () => {
  let browser: Browser
  let page: Page
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  )

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  })
  afterAll(async () => {
    await browser?.close()
  })
  beforeEach(async () => {
    page = await browser.newPage()
    await page.setRequestInterception(true)
  })
  afterEach(async () => {
    await page?.close()
  })

  it('waits for a delayed content image before producing PDF', async () => {
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    let requested!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      requested = resolve
    })
    page.on('request', (request) => {
      requested()
      void ready.then(async () => {
        await request.respond({ status: 200, contentType: 'image/png', body: png })
      })
    })
    await page.setContent('<img data-type="image" src="https://files.test/new.png">', { waitUntil: 'domcontentloaded' })
    await requestStarted
    let finished = false
    const printing = waitForImages(page).then(async () => {
      finished = true
      return await page.pdf()
    })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(finished).toBe(false)
    release()
    expect((await printing).byteLength).toBeGreaterThan(0)
    expect(await page.$eval('img', (image) => image.naturalWidth)).toBe(1)
  })

  it('rejects printing when a content image returns 404', async () => {
    page.on('request', (request) => {
      void request.respond({ status: 404 })
    })
    await page.setContent('<div class="text-editor-image-container"><img src="https://files.test/missing.png"></div>')
    await expect(waitForImages(page)).rejects.toThrow('Could not load a document image')
  })

  it('allows a failed decorative image outside document content', async () => {
    page.on('request', (request) => {
      void request.respond({ status: 404 })
    })
    await page.setContent('<img class="decoration" src="https://files.test/missing.png">')
    await expect(waitForImages(page)).resolves.toBeUndefined()
  })
})
